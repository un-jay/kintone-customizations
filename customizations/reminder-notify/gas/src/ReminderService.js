// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/19        J.Yamamoto      :クエリに渡す日時をミリ秒なしのISO 8601形式に統一
//                                                (公式ドキュメントのクエリ例と同じ形式に揃えるため)
//  V2.0.0     2026/09/13        J.Yamamoto      :1レコード1タイミングだった送信予定日時を、
//                                                ReminderSchedulesテーブルによる複数タイミング
//                                                対応へ変更。レコード単位ではなく行単位で
//                                                送信対象を判定・処理するように変更
//                                                (pickDueScheduleRows/buildMailRecordViewを追加)。
//                                                エラーメッセージへタイムスタンプを付与
//  V2.1.0     2026/09/16        J.Yamamoto      :updateScheduleRow(KintoneClient.js)の
//                                                シグネチャ変更(テーブル全行を渡す)に追従。
//                                                同じレコード内に複数の送信対象行がある場合、
//                                                1行目の更新で2行目以降が消えて2通目以降が
//                                                送信されなくなっていた不具合を修正
//  V2.2.0     2026/09/16        J.Yamamoto      :エラー状態への書き戻し自体が失敗した場合、
//                                                行が「送信処理中」等のまま無言でスタックし、
//                                                顧客側はkintone上で気付く手段が無かったため、
//                                                notifyAdminOnFailureで管理者へメール通知
//                                                するように変更
//  V2.3.0     2026/09/16        J.Yamamoto      :GASの実行時間上限超過等で処理が中断され、
//                                                行が「送信処理中」のまま残るケース
//                                                (例外を伴わないため従来は検知不能)を、
//                                                次回実行時に検出して管理者へ通知するよう
//                                                pickStuckProcessingRowsを追加。
//                                                KintoneClient.jsのクエリに合わせて対応
// ----------------------------------------------------------------------
//     ModuleName  : リマインド送信処理(ReminderService.js)
//     Description : 対象レコードの抽出→送信→結果書き戻しを行う業務ロジック。
//                   抽出・更新はKintoneClient.js、送信はMailer.jsに委譲する。
// ======================================================================

'use strict';

/**
 * 送信対象レコードをすべて処理する。
 * @param {Object} config - loadConfig()の戻り値
 * @returns {{processed: number, succeeded: number, failed: number}} 処理件数のサマリー
 *          (processed等は行(ReminderSchedulesの1行=1通のメール)単位の件数)
 */
function processReminders(config) {
    // kintoneのクエリで日時を比較する際はミリ秒なしのISO 8601形式(例: 2026-08-19T12:00:00Z)を使う。
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const candidateRecords = fetchTargetRecords(config, nowIso);
    const F = config.fields;

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const stuckRowLabels = [];

    candidateRecords.forEach((record) => {
        const recordId = record.$id.value;
        let revision = record.$revision.value;
        const scheduleRows = record[F.SCHEDULES]?.value || [];

        // fetchTargetRecordsで取得した時点(=今回の処理を始める前)のスナップショットに
        // 「送信処理中」の行が残っているのは、前回以前の実行がGASの実行時間上限超過等で
        // 中断され、書き戻しが行われなかった証拠(正常時は同じ実行内で必ずSENT/ERRORへ
        // 解消される)。この段階では例外を伴わないため、検出しない限り気付く手段が無い。
        pickStuckProcessingRows(scheduleRows, F, STATUS.PROCESSING).forEach((row) => {
            stuckRowLabels.push(`レコードid=${recordId} 行id=${row.id}`);
        });

        const dueRows = pickDueScheduleRows(
            scheduleRows,
            F,
            STATUS.UNSENT,
            SEND_REQUEST_VALUE,
            nowIso,
        );

        dueRows.forEach((scheduleRow) => {
            processed++;
            const result = processOneSchedule(
                config,
                recordId,
                revision,
                record,
                scheduleRows,
                scheduleRow,
                nowIso,
            );
            revision = result.revision;
            if (result.succeeded) {
                succeeded++;
            } else {
                failed++;
            }
        });
    });

    if (stuckRowLabels.length > 0) {
        notifyAdminOnFailure(
            config,
            'リマインドチェック処理',
            new Error(
                `前回以前の実行が中断され、「送信処理中」のまま残っていると見られる行が` +
                    `${stuckRowLabels.length}件あります: ${stuckRowLabels.join(', ')}。` +
                    '実際にメールが送信済みか受信箱を確認したうえで、kintoneの管理者権限で' +
                    '該当行のSEND_STATUSを手動で修正してください(二重送信防止のため自動では復旧しません)。',
            ),
        );
    }

    return { processed, succeeded, failed, stuck: stuckRowLabels.length };
}

/**
 * ReminderSchedulesの行から、前回以前の実行で処理が中断されたと推定される行
 * (SEND_STATUS=送信処理中のまま残っている行)を抽出する。
 * 呼び出しは、今回のfetchTargetRecordsで取得した時点のスナップショットに対してのみ
 * 行うこと。今回の実行が自分自身でPROCESSINGへ更新した行は、この判定より後に
 * scheduleRows配列をその場で書き換えるため、ここでは混同されない。
 * @param {Array<Object>} scheduleRows      - ReminderSchedulesテーブルのvalue配列
 * @param {Object}        fields            - フィールドコード定数(config.fields)
 * @param {string}        processingStatus  - 「送信処理中」を表すSEND_STATUSの値
 * @returns {Array<Object>} 中断されたと推定される行配列
 */
function pickStuckProcessingRows(scheduleRows, fields, processingStatus) {
    return (scheduleRows || []).filter(
        (row) => row.value[fields.SEND_STATUS]?.value === processingStatus,
    );
}

/**
 * ReminderSchedulesの行から、実際に送信対象となる行(未送信 かつ (送信予定日時到来 または
 * 即時送信要求あり))を抽出する。kintoneのクエリはサブテーブル内の複数フィールド条件の
 * AND組み合わせで「同じ行が両方満たす」ことまでは保証しないため、候補レコード取得後に
 * 行単位でここで再判定する(詳細はKintoneClient.jsのfetchTargetRecordsのコメントを参照)。
 * @param {Array<Object>} scheduleRows      - ReminderSchedulesテーブルのvalue配列
 * @param {Object}        fields            - フィールドコード定数(config.fields)
 * @param {string}        unsentStatus      - 「未送信」を表すSendStatusの値
 * @param {string}        sendRequestValue  - 即時送信要求チェックボックスの値
 * @param {string}        nowIso            - 現在時刻(ISO 8601)
 * @returns {Array<Object>} 送信対象の行配列
 */
function pickDueScheduleRows(
    scheduleRows,
    fields,
    unsentStatus,
    sendRequestValue,
    nowIso,
) {
    return (scheduleRows || []).filter((row) => {
        const values = row.value;
        if (values[fields.SEND_STATUS]?.value !== unsentStatus) {
            return false;
        }
        const scheduledAt = values[fields.SCHEDULED_AT]?.value;
        const isDue = Boolean(scheduledAt) && scheduledAt <= nowIso;
        const isRequested = (values[fields.SEND_REQUEST]?.value || []).includes(
            sendRequestValue,
        );
        return isDue || isRequested;
    });
}

/**
 * メール本文・件名のプレースホルダ({{DaysBefore}}等)がその送信タイミングの値に
 * 置換されるよう、レコードの値と対象行の値をマージしたビューを作る。
 * @param {Object} record      - kintoneレコード
 * @param {Object} scheduleRow - 送信対象のReminderSchedules行
 * @param {Object} fields      - フィールドコード定数(config.fields)
 * @returns {Object} renderTemplate/extractRecipientsByTypeにそのまま渡せる形式
 */
function buildMailRecordView(record, scheduleRow, fields) {
    return {
        ...record,
        [fields.DAYS_BEFORE]: scheduleRow.value[fields.DAYS_BEFORE],
        [fields.SEND_TIME]: scheduleRow.value[fields.SEND_TIME],
        [fields.SCHEDULED_AT]: scheduleRow.value[fields.SCHEDULED_AT],
    };
}

/**
 * エラーメッセージの先頭に発生日時(JST)を付与する。
 * @param {Error} error
 * @returns {string}
 */
function formatErrorMessage(error) {
    const timestamp = Utilities.formatDate(
        new Date(),
        'Asia/Tokyo',
        'yyyy/MM/dd HH:mm:ss',
    );
    const message = (error && error.message) || String(error);
    // kintoneの文字列(複数行)フィールドへ収まるよう、念のため長さを制限する。
    return `${timestamp}\n${message}`.slice(0, 10000);
}

/**
 * ReminderSchedulesの1行を処理する(処理中に更新→送信→結果書き戻し)。
 * updateScheduleRowにはテーブルの全行(scheduleRows)を渡す。同じレコード内で
 * 複数行を続けて処理する場合、直前までの更新がscheduleRows自体に反映されているため、
 * 後続の行を更新しても前の行の結果を上書き・消失させない。
 * @param {Object}        config
 * @param {string|number} recordId
 * @param {string}        revision      - 処理開始時点のレコードrevision
 * @param {Object}        record        - kintoneレコード
 * @param {Array<Object>} scheduleRows  - REMINDER_SCHEDULESテーブルの全行
 * @param {Object}        scheduleRow   - 送信対象の行(scheduleRowsに含まれる要素)
 * @param {string}        nowIso
 * @returns {{revision: string, succeeded: boolean}} 更新後のrevisionと成否
 */
function processOneSchedule(
    config,
    recordId,
    revision,
    record,
    scheduleRows,
    scheduleRow,
    nowIso,
) {
    const F = config.fields;
    const scheduleRowId = scheduleRow.id;
    let currentRevision = revision;

    try {
        currentRevision = updateScheduleRow(
            config,
            recordId,
            currentRevision,
            scheduleRows,
            scheduleRowId,
            { [F.SEND_STATUS]: STATUS.PROCESSING },
        );

        sendReminderMail(config, buildMailRecordView(record, scheduleRow, F));

        const previousCount = Number(scheduleRow.value[F.SEND_COUNT]?.value) || 0;
        currentRevision = updateScheduleRow(
            config,
            recordId,
            currentRevision,
            scheduleRows,
            scheduleRowId,
            {
                [F.SEND_STATUS]: STATUS.SENT,
                [F.SENT_AT]: nowIso,
                [F.SEND_COUNT]: String(previousCount + 1),
                [F.SEND_REQUEST]: [],
                [F.ERROR_MESSAGE]: '',
            },
        );
        return { revision: currentRevision, succeeded: true };
    } catch (error) {
        Logger.log(
            `レコードid=${recordId} 行id=${scheduleRowId}の送信に失敗しました: ${error.stack || error.message}`,
        );
        try {
            currentRevision = updateScheduleRow(
                config,
                recordId,
                currentRevision,
                scheduleRows,
                scheduleRowId,
                {
                    [F.SEND_STATUS]: STATUS.ERROR,
                    [F.ERROR_MESSAGE]: formatErrorMessage(error),
                },
            );
        } catch (updateError) {
            Logger.log(
                `レコードid=${recordId} 行id=${scheduleRowId}のエラー状態書き戻しにも失敗しました: ${updateError.message}`,
            );
            // 書き戻し自体が失敗すると、この行は「送信処理中」等のまま無言でスタックし、
            // kintone上には何のエラーも表示されない(顧客側が気付く手段が無い)ため、
            // 個々の行のERROR_MESSAGEの代わりに管理者へメール通知する。
            notifyAdminOnFailure(
                config,
                `レコードid=${recordId} 行id=${scheduleRowId}のエラー状態書き戻し`,
                updateError,
            );
        }
        return { revision: currentRevision, succeeded: false };
    }
}

// Vitestからのテスト用に、副作用を持たない関数のみをCommonJS export経由で公開する。
// GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        pickDueScheduleRows,
        buildMailRecordView,
        pickStuckProcessingRows,
    };
}
