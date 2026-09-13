// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更、
//                                                固定フィールドコード(FIELD)を使用
//  V1.2.0     2026/08/18        J.Yamamoto      :ファイルを1つに統合
//                                                (JS/CSSカスタマイズは手動アップロードのため、
//                                                 ファイル数が増えるほど運用の手間が増える。
//                                                 プラグインと異なり自動パッケージングが無いので、
//                                                 責務ごとのセクションコメントで区切って1ファイル化する)
//  V1.3.0     2026/08/19        J.Yamamoto      :kintone.showNotification()の引数を
//                                                正しい(type, message)形式に修正
//  V1.4.0     2026/08/19        J.Yamamoto      :即時送信成功時、通知が読めるよう
//                                                リロードを少し遅延させるように変更
//  V1.5.0     2026/08/25        J.Yamamoto      :確認ダイアログのOKボタン文言が長く、
//                                                kintone標準ダイアログのボタン幅に収まらず
//                                                末尾が見切れていたため短縮
//  V1.6.0     2026/09/01        J.Yamamoto      :計算処理の純粋関数をVitestからテストできるよう、
//                                                ブラウザ実行時には影響しないCommonJS export
//                                                (module存在チェック付き)を末尾に追加
//  V2.0.0     2026/09/13        J.Yamamoto      :1レコード1タイミングだった送信予定日時を、
//                                                ReminderSchedulesテーブルによる複数タイミング
//                                                対応へ変更。送信ステータス等も行単位で持つ。
//                                                「今すぐメール送信」は未送信の行をまとめて対象にする
// ----------------------------------------------------------------------
//     ModuleName  : メイン処理(desktop.js)
//     Description : リマインド通知カスタマイズの全処理をまとめたファイル。
//                   対象アプリはFIELD定数のフィールドコードで作成されている前提。
//                   フィールド一覧はCLAUDE.mdを参照。
// ======================================================================

(() => {
    'use strict';

    // ==========================
    // 定数
    // ==========================

    /** 対象アプリのフィールドコード(固定)。アプリ側はこのコードに合わせて作成する */
    const FIELD = {
        TITLE: 'TITLE',
        DEADLINE: 'DEADLINE',
        MAIL_SUBJECT: 'MAIL_SUBJECT',
        MAIL_BODY: 'MAIL_BODY',
        RECIPIENTS: 'RECIPIENTS',
        RECIPIENT_CODE: 'RECIPIENT_CODE',
        RECIPIENT_NAME: 'RECIPIENT_NAME',
        RECIPIENT_EMAIL: 'RECIPIENT_EMAIL',
        RECIPIENT_TYPE: 'RECIPIENT_TYPE',
        // REMINDER_SCHEDULESテーブル(1行 = 1つの送信タイミング)の列
        SCHEDULES: 'REMINDER_SCHEDULES',
        DAYS_BEFORE: 'DAYS_BEFORE',
        SEND_TIME: 'SEND_TIME',
        SCHEDULED_AT: 'SCHEDULED_SEND_AT',
        SEND_STATUS: 'SEND_STATUS',
        SEND_REQUEST: 'SEND_REQUEST',
        SENT_AT: 'SENT_AT',
        ERROR_MESSAGE: 'ERROR_MESSAGE',
        SEND_COUNT: 'SEND_COUNT',
    };

    /** ステータスフィールドに設定する文言(固定値) */
    const STATUS = {
        UNSENT: '未送信',
        PROCESSING: '送信処理中',
        SENT: '送信済み',
        ERROR: 'エラー',
        STOPPED: '停止',
    };

    /** 即時送信リクエスト(チェックボックス等)に設定する値 */
    const SEND_REQUEST_VALUE = '即時送信';

    /** UIに表示するテキスト */
    const UI = {
        SEND_NOW_BUTTON: '今すぐメール送信',
        SENDING_LABEL: '送信要求を登録中...',
        CONFIRM_TITLE: '送信確認',
        CONFIRM_SCHEDULES_LABEL: '対象タイミング',
        CONFIRM_RECIPIENTS_LABEL: '送信先',
        CONFIRM_OK: '送信要求を登録',
        CONFIRM_CANCEL: 'キャンセル',
        NOTIFY_SUCCESS:
            'メール送信要求を登録しました。GASの次回定期実行時に送信されます。',
        NOTIFY_NO_RECIPIENTS: '送信先が登録されていません。',
        NOTIFY_NO_SCHEDULES: '送信可能な未送信タイミングがありません。',
    };

    /** 成功通知を表示してからリロードするまでの待機時間(ミリ秒)。通知を読めるようにするため */
    const RELOAD_DELAY_MS = 1500;

    /** エラーメッセージ */
    const MSGS = {
        INVALID_DAYS_BEFORE: '「何日前に送るか」には0以上の整数を入力してください。',
        NO_RECIPIENTS: '送信先を1件以上登録してください。',
        NO_SCHEDULES: '送信タイミング(ReminderSchedules)を1件以上登録してください。',
        PROCESSING_LOCKED: '現在メール送信処理中の行があるため、編集できません。',
        SEND_REQUEST_FAILED: '送信要求の登録に失敗しました。',
    };

    const BUTTON_ID = 'reminder-notify-immediate-send-button';

    // ==========================
    // 計算処理
    // DOM操作・API呼び出し・副作用は行わない純粋関数のみを置く。
    // ==========================

    /**
     * 納期・何日前・送信時刻から送信予定日時(ISO文字列)を算出する。
     * @param {Object} params
     * @param {string} params.deadline       - 納期(YYYY-MM-DD)
     * @param {string} params.daysBeforeText - 何日前に送るか(文字列の整数)
     * @param {string} params.sendTime       - 送信時刻(HH:mm)
     * @returns {{value: string, error: string|null}}
     *          value: 算出したISO文字列(算出できない場合は空文字)
     *          error: 入力値が不正な場合のエラーメッセージ(問題なければnull)
     */
    function calculateScheduledDateTime({ deadline, daysBeforeText, sendTime }) {
        if (
            !deadline ||
            daysBeforeText === '' ||
            daysBeforeText === undefined ||
            !sendTime
        ) {
            return { value: '', error: null };
        }

        const daysBefore = Number(daysBeforeText);
        if (!Number.isInteger(daysBefore) || daysBefore < 0) {
            return { value: '', error: MSGS.INVALID_DAYS_BEFORE };
        }

        const [year, month, day] = deadline.split('-').map(Number);
        const [hour, minute] = sendTime.split(':').map(Number);

        const scheduledDate = new Date(year, month - 1, day, hour, minute, 0, 0);
        scheduledDate.setDate(scheduledDate.getDate() - daysBefore);

        return { value: scheduledDate.toISOString(), error: null };
    }

    /**
     * 送信先テーブルの行データから、有効な送信先が1件以上あるかを判定する。
     * @param {Array<Object>} recipientRows      - Recipientsテーブルのvalue配列
     * @param {string}        recipientCodeField - 送信先コードのフィールドコード
     * @returns {{valid: boolean, error: string|null}}
     */
    function validateRecipients(recipientRows, recipientCodeField) {
        const rows = recipientRows || [];
        const hasValidRow = rows.some((row) =>
            Boolean(row.value[recipientCodeField]?.value),
        );

        if (!hasValidRow) {
            return { valid: false, error: MSGS.NO_RECIPIENTS };
        }
        return { valid: true, error: null };
    }

    /**
     * 送信先テーブルから、送信先コードの配列を抽出する(空欄は除外)。
     * @param {Array<Object>} recipientRows
     * @param {string}        recipientCodeField
     * @returns {string[]}
     */
    function extractRecipientCodes(recipientRows, recipientCodeField) {
        return (recipientRows || [])
            .map((row) => row.value[recipientCodeField]?.value)
            .filter(Boolean);
    }

    /**
     * 送信先テーブルから、確認ダイアログ表示用の名称一覧を作る。
     * 名称が未入力の行はコードで代替する。
     * @param {Array<Object>} recipientRows
     * @param {string}        recipientNameField
     * @param {string}        recipientCodeField
     * @returns {string[]}
     */
    function buildRecipientDisplayNames(
        recipientRows,
        recipientNameField,
        recipientCodeField,
    ) {
        return (recipientRows || [])
            .map(
                (row) =>
                    row.value[recipientNameField]?.value ||
                    row.value[recipientCodeField]?.value,
            )
            .filter(Boolean);
    }

    /**
     * ReminderSchedulesテーブルの行から、現在「未送信」の行だけを抽出する。
     * 「今すぐメール送信」ボタンは、この関数が返す行をまとめて即時送信対象にする。
     * @param {Array<Object>} scheduleRows      - ReminderSchedulesテーブルのvalue配列
     * @param {string}        sendStatusField   - 送信ステータスのフィールドコード
     * @param {string}        unsentStatusValue - 「未送信」を表すステータス文言
     * @returns {Array<Object>} 未送信の行配列(id/valueを含む元の行オブジェクトのまま)
     */
    function pickUnsentScheduleRows(scheduleRows, sendStatusField, unsentStatusValue) {
        return (scheduleRows || []).filter(
            (row) => row.value[sendStatusField]?.value === unsentStatusValue,
        );
    }

    /**
     * ReminderSchedulesの行から、確認ダイアログ表示用のラベル一覧を作る(例: "3日前(09:00)")。
     * @param {Array<Object>} scheduleRows
     * @param {string}        daysBeforeField
     * @param {string}        sendTimeField
     * @returns {string[]}
     */
    function buildScheduleDisplayLabels(scheduleRows, daysBeforeField, sendTimeField) {
        return (scheduleRows || []).map((row) => {
            const daysBefore = row.value[daysBeforeField]?.value;
            const sendTime = row.value[sendTimeField]?.value;
            return `${daysBefore}日前(${sendTime})`;
        });
    }

    // ==========================
    // REST API処理
    // kintone REST APIの呼び出しのみを行う。DOM操作・計算処理は行わない。
    // ==========================

    /**
     * ReminderSchedulesの指定行をまとめて即時送信要求へ更新する。
     * 行はidで指定するため、他の行・他のフィールドには影響しない。
     * @param {Object} params
     * @param {number} params.appId
     * @param {number} params.recordId
     * @param {string} params.revision
     * @param {Array<Object>} params.scheduleRows - 対象行(id/valueを含む元の行オブジェクト)
     * @returns {Promise<Object>} kintone REST APIのレスポンス
     */
    async function requestImmediateSend({ appId, recordId, revision, scheduleRows }) {
        const params = {
            app: appId,
            id: recordId,
            revision,
            record: {
                [FIELD.SCHEDULES]: {
                    value: scheduleRows.map((row) => ({
                        id: row.id,
                        value: {
                            [FIELD.SEND_REQUEST]: { value: [SEND_REQUEST_VALUE] },
                            [FIELD.SEND_STATUS]: { value: STATUS.UNSENT },
                            [FIELD.ERROR_MESSAGE]: { value: '' },
                        },
                    })),
                },
            },
        };

        return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', params);
    }

    // ==========================
    // UI処理
    // DOM生成・ダイアログ表示・通知表示を行う。DOM操作を許可する唯一のセクション。
    // ==========================

    /** 即時送信ボタンを生成する(まだ親要素へは追加しない) */
    function createSendButton() {
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.className = 'kintoneplugin-button-normal';
        button.textContent = UI.SEND_NOW_BUTTON;
        button.style.marginLeft = '8px';
        return button;
    }

    /** ボタンを「処理中」表示にする */
    function setButtonSending(button) {
        button.disabled = true;
        button.textContent = UI.SENDING_LABEL;
    }

    /** ボタンを通常表示へ戻す */
    function resetButton(button) {
        button.disabled = false;
        button.textContent = UI.SEND_NOW_BUTTON;
    }

    /**
     * 送信確認ダイアログを表示する。
     * @param {string[]} scheduleLabels  - 対象タイミングの表示名一覧
     * @param {string[]} recipientNames  - 送信先の表示名一覧
     * @returns {Promise<boolean>} OKが押されたらtrue
     */
    async function confirmSend(scheduleLabels, recipientNames) {
        const bodyElm = document.createElement('div');

        appendLabeledList(bodyElm, UI.CONFIRM_SCHEDULES_LABEL, scheduleLabels);
        appendLabeledList(bodyElm, UI.CONFIRM_RECIPIENTS_LABEL, recipientNames);

        const dialog = await kintone.createDialog({
            title: UI.CONFIRM_TITLE,
            body: bodyElm,
            okButtonText: UI.CONFIRM_OK,
            showCancelButton: true,
            cancelButtonText: UI.CONFIRM_CANCEL,
            showCloseButton: false,
        });

        const action = await dialog.show();
        return action === 'OK';
    }

    /** ダイアログ本文へ「見出し + 箇条書き」を追加する */
    function appendLabeledList(parentElm, label, items) {
        const labelElm = document.createElement('p');
        labelElm.textContent = `${label}：`;
        parentElm.appendChild(labelElm);

        const listElm = document.createElement('ul');
        items.forEach((item) => {
            const itemElm = document.createElement('li');
            itemElm.textContent = item;
            listElm.appendChild(itemElm);
        });
        parentElm.appendChild(listElm);
    }

    /**
     * kintone通知でメッセージを表示する。
     * @param {string} text
     * @param {'INFO'|'SUCCESS'|'ERROR'} [type] - 通知の種類(既定はINFO)
     */
    function notify(text, type = 'INFO') {
        kintone.showNotification(type, text);
    }

    // ==========================
    // イベント制御
    // イベント登録のみを行う(計算処理→API処理→UI処理の呼び出し)。
    // ==========================

    /** 納期の変更: ReminderSchedulesの全行を再計算する */
    kintone.events.on(
        [
            'app.record.create.change.' + FIELD.DEADLINE,
            'app.record.edit.change.' + FIELD.DEADLINE,
        ],
        (event) => {
            const record = event.record;
            const deadline = record[FIELD.DEADLINE].value;
            const scheduleRows = record[FIELD.SCHEDULES].value;

            for (const row of scheduleRows) {
                const result = calculateScheduledDateTime({
                    deadline,
                    daysBeforeText: row.value[FIELD.DAYS_BEFORE].value,
                    sendTime: row.value[FIELD.SEND_TIME].value,
                });
                if (result.error) {
                    event.error = result.error;
                    return event;
                }
                row.value[FIELD.SCHEDULED_AT].value = result.value;
            }
            return event;
        },
    );

    /** ReminderSchedules行の変更(何日前/送信時刻/行追加): 変更された行だけ再計算する */
    kintone.events.on(
        [
            'app.record.create.change.' + FIELD.SCHEDULES,
            'app.record.edit.change.' + FIELD.SCHEDULES,
        ],
        (event) => {
            const row = event.changes && event.changes.row;
            if (!row) {
                return event;
            }

            const result = calculateScheduledDateTime({
                deadline: event.record[FIELD.DEADLINE].value,
                daysBeforeText: row.value[FIELD.DAYS_BEFORE].value,
                sendTime: row.value[FIELD.SEND_TIME].value,
            });
            if (result.error) {
                event.error = result.error;
                return event;
            }
            row.value[FIELD.SCHEDULED_AT].value = result.value;
            return event;
        },
    );

    /** 新規保存時・編集保存時共通のバリデーション+算出 */
    function validateAndCalculate(record) {
        const deadline = record[FIELD.DEADLINE].value;
        const scheduleRows = record[FIELD.SCHEDULES].value;

        if (scheduleRows.length === 0) {
            throw new Error(MSGS.NO_SCHEDULES);
        }

        scheduleRows.forEach((row) => {
            const result = calculateScheduledDateTime({
                deadline,
                daysBeforeText: row.value[FIELD.DAYS_BEFORE].value,
                sendTime: row.value[FIELD.SEND_TIME].value,
            });
            if (result.error) {
                throw new Error(result.error);
            }
            row.value[FIELD.SCHEDULED_AT].value = result.value;
        });

        const recipientCheck = validateRecipients(
            record[FIELD.RECIPIENTS].value,
            FIELD.RECIPIENT_CODE,
        );
        if (!recipientCheck.valid) {
            throw new Error(recipientCheck.error);
        }
    }

    kintone.events.on('app.record.create.submit', (event) => {
        const record = event.record;
        try {
            validateAndCalculate(record);
            record[FIELD.SCHEDULES].value.forEach((row) => {
                row.value[FIELD.SEND_STATUS].value = STATUS.UNSENT;
                row.value[FIELD.SEND_REQUEST].value = [];
                row.value[FIELD.SENT_AT].value = '';
                row.value[FIELD.ERROR_MESSAGE].value = '';
                if (!row.value[FIELD.SEND_COUNT].value) {
                    row.value[FIELD.SEND_COUNT].value = '0';
                }
            });
        } catch (error) {
            event.error = error.message;
        }
        return event;
    });

    kintone.events.on('app.record.edit.submit', (event) => {
        const record = event.record;
        try {
            validateAndCalculate(record);

            record[FIELD.SCHEDULES].value.forEach((row) => {
                const status = row.value[FIELD.SEND_STATUS].value;
                if (status === STATUS.PROCESSING) {
                    throw new Error(MSGS.PROCESSING_LOCKED);
                }
                if (status === STATUS.SENT || status === STATUS.ERROR) {
                    row.value[FIELD.SEND_STATUS].value = STATUS.UNSENT;
                    row.value[FIELD.SEND_REQUEST].value = [];
                    row.value[FIELD.SENT_AT].value = '';
                    row.value[FIELD.ERROR_MESSAGE].value = '';
                }
            });
        } catch (error) {
            event.error = error.message;
        }
        return event;
    });

    kintone.events.on('app.record.detail.show', (event) => {
        if (document.getElementById(BUTTON_ID)) {
            return event;
        }

        const record = event.record;
        const button = createSendButton();

        button.addEventListener('click', async () => {
            const scheduleRows = record[FIELD.SCHEDULES].value || [];
            const unsentRows = pickUnsentScheduleRows(
                scheduleRows,
                FIELD.SEND_STATUS,
                STATUS.UNSENT,
            );
            if (unsentRows.length === 0) {
                notify(UI.NOTIFY_NO_SCHEDULES, 'ERROR');
                return;
            }

            const recipientRows = record[FIELD.RECIPIENTS].value || [];
            const recipientCodes = extractRecipientCodes(
                recipientRows,
                FIELD.RECIPIENT_CODE,
            );
            if (recipientCodes.length === 0) {
                notify(UI.NOTIFY_NO_RECIPIENTS, 'ERROR');
                return;
            }

            const recipientNames = buildRecipientDisplayNames(
                recipientRows,
                FIELD.RECIPIENT_NAME,
                FIELD.RECIPIENT_CODE,
            );
            const scheduleLabels = buildScheduleDisplayLabels(
                unsentRows,
                FIELD.DAYS_BEFORE,
                FIELD.SEND_TIME,
            );

            const confirmed = await confirmSend(scheduleLabels, recipientNames);
            if (!confirmed) {
                return;
            }

            setButtonSending(button);
            try {
                await requestImmediateSend({
                    appId: kintone.app.getId(),
                    recordId: kintone.app.record.getId(),
                    revision: record.$revision.value,
                    scheduleRows: unsentRows,
                });
                notify(UI.NOTIFY_SUCCESS, 'SUCCESS');
                // 通知を読めるように少し待ってからリロードする。
                setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
            } catch (error) {
                console.error(error);
                notify(
                    MSGS.SEND_REQUEST_FAILED +
                        '\n' +
                        (error.message || JSON.stringify(error)),
                    'ERROR',
                );
                resetButton(button);
            }
        });

        const headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
        if (headerSpace) {
            headerSpace.appendChild(button);
        }

        return event;
    });

    // Vitestからのテスト用に、計算処理の純粋関数とエラーメッセージ定数を
    // CommonJS export経由で公開する。kintone(ブラウザ)実行時はmoduleが
    // 存在しないため、このブロックは実行されない。
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            calculateScheduledDateTime,
            validateRecipients,
            extractRecipientCodes,
            buildRecipientDisplayNames,
            pickUnsentScheduleRows,
            buildScheduleDisplayLabels,
            MSGS,
        };
    }
})();
