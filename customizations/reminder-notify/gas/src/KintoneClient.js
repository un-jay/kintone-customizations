// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/19        J.Yamamoto      :KINTONE_SUBDOMAINに誤って完全なドメイン
//                                                (例: xxx.cybozu.com)を設定しても、
//                                                .cybozu.comが二重に付かないようにした
//  V1.2.0     2026/08/19        J.Yamamoto      :クエリ不正(CB_IL02)を修正。
//                                                (1)送信ステータスがドロップダウン設定の場合、
//                                                   =演算子は使えないためin演算子に変更
//                                                (2)or条件全体を()で囲わずand $id > Xを
//                                                   後置していたため、意図しない演算子優先順位に
//                                                   なっていたのを明示的なグループ化で修正
//  V1.3.0     2026/08/19        J.Yamamoto      :切り分け用に、実際に送信するクエリを
//                                                実行ログへ出力するようにした(デバッグ用)
//  V1.4.0     2026/08/19        J.Yamamoto      :かっこの3重ネストが原因のクエリ不正(CB_IL02)を
//                                                修正。$id > Xの絞り込みをor分岐ごとに分配し、
//                                                グループ化を1階層までに抑えた
//  V1.5.0     2026/08/19        J.Yamamoto      :GET(records.json)にContent-Type: application/json
//                                                を付けていたのが原因のCB_IL02を修正。
//                                                GETはクエリ文字列でパラメーターを渡すため
//                                                Content-Typeを付けない。PUT(record.json)のみ
//                                                JSONボディを送るのでContent-Typeを付与する。
//  V1.6.0     2026/08/31        J.Yamamoto      :動作確認が取れたため、CB_IL02切り分け用の
//                                                デバッグログ(送信クエリのLogger.log)を削除
//  V1.7.0     2026/09/01        J.Yamamoto      :buildBaseUrlをVitestからテストできるよう、
//                                                GAS実行時には影響しないCommonJS export
//                                                (module存在チェック付き)を末尾に追加
//  V2.0.0     2026/09/13        J.Yamamoto      :1レコード1タイミングだった送信予定日時を、
//                                                ReminderSchedulesテーブルによる複数タイミング
//                                                対応へ変更。updateRecordを廃止し、テーブルの
//                                                特定行だけを更新するupdateScheduleRowを追加
//                                                (更新後のrevisionはレスポンスから取得する)
//  V2.1.0     2026/09/16        J.Yamamoto      :updateScheduleRowが対象行だけをPUTしていたため、
//                                                kintone REST APIの仕様(テーブル更新時、
//                                                リクエストに含めない行は削除される)により、
//                                                他の行が消える/idが変わって次の更新が失敗する
//                                                不具合を修正。テーブルの全行を受け取り、対象行の
//                                                値だけをその場で書き換えたうえで全行を送信する
//  V2.2.0     2026/09/16        J.Yamamoto      :fetchTargetRecordsのクエリに
//                                                「SEND_STATUS=送信処理中」の行も対象として
//                                                追加。GASの実行時間上限超過等で処理が中断され
//                                                「送信処理中」のまま残った行を、追加のAPI
//                                                リクエスト無しで次回実行時に検出できるようにする
//                                                (ReminderService.jsのpickStuckProcessingRows)
// ----------------------------------------------------------------------
//     ModuleName  : kintone REST APIクライアント(KintoneClient.js)
//     Description : UrlFetchAppによるkintone REST API呼び出しのみを行う。
//                   メール送信・業務ロジックはReminderService.jsに委譲する。
// ======================================================================

'use strict';

/**
 * KINTONE_SUBDOMAINには「サブドメイン名のみ」（例: example）を想定しているが、
 * 誤って完全なドメイン（例: example.cybozu.com）が設定された場合でも
 * 動作するよう、末尾の".cybozu.com"は取り除いてから付与し直す。
 * @param {Object} config - loadConfig()の戻り値
 * @returns {string} kintoneのベースURL
 */
function buildBaseUrl(config) {
    const subdomain = config.subdomain.replace(/\.cybozu\.com\/?$/i, '');
    return `https://${subdomain}.cybozu.com`;
}

/**
 * 認証ヘッダーのみを返す(Content-Typeは含めない)。
 * GET(records.json)はクエリ文字列でパラメーターを渡すため、Content-Type: application/json
 * を付けると不正リクエスト(CB_IL02)になることがある。JSONボディを送るリクエスト
 * (PUT等)では、呼び出し側で個別にContent-Typeを追加すること。
 * @param {Object} config
 * @returns {Object} 認証ヘッダー
 */
function buildAuthHeader(config) {
    return {
        'X-Cybozu-API-Token': config.apiToken,
    };
}

/**
 * 送信対象の候補レコードを取得する。
 * 条件: (送信ステータス=未送信 かつ 送信予定日時<=現在時刻) または 即時送信要求あり
 * または 送信ステータス=送信処理中(前回以前の実行が中断され、書き戻せずに残っている
 * 可能性がある行を検出するため。追加のAPIリクエスト無しでこのクエリに相乗りさせる)。
 * これらはReminderSchedulesテーブル内のフィールドだが、フィールドコードはアプリ内で
 * 一意なためテーブル名を付けず直接参照できる。
 *
 * 【重要】kintoneのクエリは、サブテーブル内の複数フィールド条件をANDで組み合わせても
 * 「同じ行が両方の条件を満たす」ことまでは保証しない(別々の行がそれぞれの条件を
 * 満たしていてもレコードとしてヒットしうる)。そのためこのクエリは「候補レコードの
 * 粗い絞り込み」に過ぎない。実際にどの行が送信対象か・処理中のまま残っているかは、
 * 取得後にpickDueScheduleRows/pickStuckProcessingRows(ReminderService.js)で
 * 行単位に再判定する。
 *
 * 501件目以降は$id昇順のseek法で取得する(kintone REST APIの1回あたり取得上限が500件のため)。
 * @param {Object} config
 * @param {string} nowIso - 現在時刻(ISO 8601)
 * @returns {Array<Object>} 対象候補レコードの配列
 */
function fetchTargetRecords(config, nowIso) {
    const F = config.fields;
    // SEND_STATUSは文字列(1行)・ドロップダウンどちらで作成されていても動くよう、
    // (ドロップダウンは=/!=が使えずin/not inのみのため) in演算子で統一する。
    // かっこの入れ子は1階層までとし($id > X の絞り込みを各or分岐にそれぞれ分配する)、
    // 公式ドキュメントのグループ化例(a) or (b)と同じ深さに揃える。

    const records = [];
    let lastId = 0;

    for (;;) {
        const seekQuery =
            `(${F.SEND_STATUS} in ("${STATUS.UNSENT}") and ${F.SCHEDULED_AT} <= "${nowIso}" and $id > ${lastId}) ` +
            `or (${F.SEND_REQUEST} in ("${SEND_REQUEST_VALUE}") and $id > ${lastId}) ` +
            `or (${F.SEND_STATUS} in ("${STATUS.PROCESSING}") and $id > ${lastId}) ` +
            `order by $id asc limit ${RECORDS_PER_REQUEST}`;
        const url =
            `${buildBaseUrl(config)}/k/v1/records.json` +
            `?app=${encodeURIComponent(config.appId)}&query=${encodeURIComponent(seekQuery)}`;

        const response = UrlFetchApp.fetch(url, {
            method: 'get',
            headers: buildAuthHeader(config),
            muteHttpExceptions: true,
        });

        if (response.getResponseCode() !== 200) {
            throw new Error(`レコード取得に失敗しました: ${response.getContentText()}`);
        }

        const body = JSON.parse(response.getContentText());
        records.push(...body.records);

        if (body.records.length < RECORDS_PER_REQUEST) {
            break;
        }
        lastId = body.records[body.records.length - 1].$id.value;
    }

    return records;
}

/**
 * ReminderSchedulesテーブルの特定の1行を更新する。
 *
 * 【重要】kintone REST APIはテーブルフィールドを指定して更新する場合、リクエストに
 * 含めなかった行を削除する仕様(公式ドキュメント「テーブルを更新するとき」を参照)。
 * そのため対象行だけを送ってはならず、必ずscheduleRowsの全行を含めて送信する。
 * 対象行(scheduleRowId)の値は、このテーブル配列自体を直接書き換えたうえで送信するため、
 * 呼び出し側が同じscheduleRows配列を使い回せば、複数行を続けて更新しても
 * 直前までの更新内容が失われない。
 * @param {Object}        config
 * @param {string|number} recordId
 * @param {string}        revision
 * @param {Array<Object>} scheduleRows  - REMINDER_SCHEDULESテーブルの全行(id/valueを
 *                                        含む行オブジェクト。呼び出し元と共有し、
 *                                        この関数が対象行を直接書き換える)
 * @param {string|number} scheduleRowId - 更新対象行の$id(テーブル行のid)
 * @param {Object}        fieldValues   - { フィールドコード: 値 } の形式(行内のフィールド。
 *                                        kintoneの{value:...}形式ではない)
 * @returns {string} 更新後のrevision(レスポンスの値をそのまま使う。呼び出し側で
 *                   +1のような手動計算をしないことで、連続更新時のずれを防ぐ)
 */
function updateScheduleRow(
    config,
    recordId,
    revision,
    scheduleRows,
    scheduleRowId,
    fieldValues,
) {
    const F = config.fields;
    const targetRow = scheduleRows.find(
        (row) => String(row.id) === String(scheduleRowId),
    );
    if (!targetRow) {
        throw new Error(
            `対象行が見つかりません(recordId=${recordId}, scheduleRowId=${scheduleRowId})`,
        );
    }
    Object.entries(fieldValues).forEach(([fieldCode, value]) => {
        targetRow.value[fieldCode] = { value };
    });

    const tableValue = scheduleRows.map((row) => ({ id: row.id, value: row.value }));

    const response = UrlFetchApp.fetch(`${buildBaseUrl(config)}/k/v1/record.json`, {
        method: 'put',
        headers: {
            ...buildAuthHeader(config),
            'Content-Type': 'application/json',
        },
        muteHttpExceptions: true,
        payload: JSON.stringify({
            app: config.appId,
            id: recordId,
            revision,
            record: {
                [F.SCHEDULES]: { value: tableValue },
            },
        }),
    });

    if (response.getResponseCode() !== 200) {
        throw new Error(
            `レコード更新に失敗しました(id=${recordId}, 行id=${scheduleRowId}): ${response.getContentText()}`,
        );
    }

    const body = response.getContentText() ? JSON.parse(response.getContentText()) : {};
    return body.revision;
}

// Vitestからのテスト用に、副作用を持たないbuildBaseUrlのみをCommonJS export経由で
// 公開する。GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildBaseUrl };
}
