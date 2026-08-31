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
        TITLE: 'Title',
        DEADLINE: 'Deadline',
        DAYS_BEFORE: 'DaysBefore',
        SEND_TIME: 'SendTime',
        SCHEDULED_AT: 'ScheduledSendAt',
        MAIL_SUBJECT: 'MailSubject',
        MAIL_BODY: 'MailBody',
        SEND_STATUS: 'SendStatus',
        SEND_REQUEST: 'SendRequest',
        SENT_AT: 'SentAt',
        ERROR_MESSAGE: 'ErrorMessage',
        SEND_COUNT: 'SendCount',
        RECIPIENTS: 'Recipients',
        RECIPIENT_CODE: 'RecipientCode',
        RECIPIENT_NAME: 'RecipientName',
        RECIPIENT_EMAIL: 'RecipientEmail',
        RECIPIENT_TYPE: 'RecipientType',
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
        RESEND_BUTTON: '送信済みメールを再送',
        SENDING_LABEL: '送信要求を登録中...',
        CONFIRM_TITLE: '送信確認',
        CONFIRM_DESC_PREFIX: '次の送信先へメール送信を要求します。',
        CONFIRM_OK: '送信要求を登録',
        CONFIRM_CANCEL: 'キャンセル',
        NOTIFY_SUCCESS:
            'メール送信要求を登録しました。GASの次回定期実行時に送信されます。',
        NOTIFY_NO_RECIPIENTS: '送信先が登録されていません。',
    };

    /** エラーメッセージ */
    /** 成功通知を表示してからリロードするまでの待機時間(ミリ秒)。通知を読めるようにするため */
    const RELOAD_DELAY_MS = 1500;

    const MSGS = {
        INVALID_DAYS_BEFORE: '「何日前に送るか」には0以上の整数を入力してください。',
        NO_RECIPIENTS: '送信先を1件以上登録してください。',
        PROCESSING_LOCKED: '現在メール送信処理中のため、編集できません。',
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

    // ==========================
    // REST API処理
    // kintone REST APIの呼び出しのみを行う。DOM操作・計算処理は行わない。
    // ==========================

    /**
     * 即時送信要求を登録する(対象レコードのSendRequest/SendStatus/ErrorMessageを更新)。
     * @param {Object} params
     * @param {number} params.appId
     * @param {number} params.recordId
     * @param {string} params.revision
     * @returns {Promise<Object>} kintone REST APIのレスポンス
     */
    async function requestImmediateSend({ appId, recordId, revision }) {
        const params = {
            app: appId,
            id: recordId,
            revision,
            record: {
                [FIELD.SEND_REQUEST]: { value: [SEND_REQUEST_VALUE] },
                [FIELD.SEND_STATUS]: { value: STATUS.UNSENT },
                [FIELD.ERROR_MESSAGE]: { value: '' },
            },
        };

        return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', params);
    }

    // ==========================
    // UI処理
    // DOM生成・ダイアログ表示・通知表示を行う。DOM操作を許可する唯一のセクション。
    // ==========================

    /**
     * 即時送信ボタンを生成する(まだ親要素へは追加しない)。
     * @param {boolean} isResend - 送信済みレコードへの再送かどうか
     * @returns {HTMLButtonElement}
     */
    function createSendButton(isResend) {
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.className = 'kintoneplugin-button-normal';
        button.textContent = isResend ? UI.RESEND_BUTTON : UI.SEND_NOW_BUTTON;
        button.style.marginLeft = '8px';
        return button;
    }

    /** ボタンを「処理中」表示にする */
    function setButtonSending(button) {
        button.disabled = true;
        button.textContent = UI.SENDING_LABEL;
    }

    /**
     * ボタンを通常表示へ戻す。
     * @param {HTMLButtonElement} button
     * @param {boolean} isResend
     */
    function resetButton(button, isResend) {
        button.disabled = false;
        button.textContent = isResend ? UI.RESEND_BUTTON : UI.SEND_NOW_BUTTON;
    }

    /**
     * 送信確認ダイアログを表示する。
     * @param {string[]} recipientNames
     * @returns {Promise<boolean>} OKが押されたらtrue
     */
    async function confirmSend(recipientNames) {
        const bodyElm = document.createElement('div');

        const descElm = document.createElement('p');
        descElm.textContent = UI.CONFIRM_DESC_PREFIX;
        bodyElm.appendChild(descElm);

        const listElm = document.createElement('ul');
        recipientNames.forEach((name) => {
            const itemElm = document.createElement('li');
            itemElm.textContent = name;
            listElm.appendChild(itemElm);
        });
        bodyElm.appendChild(listElm);

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

    const CALC_EVENTS = [
        'app.record.create.change.' + FIELD.DEADLINE,
        'app.record.create.change.' + FIELD.DAYS_BEFORE,
        'app.record.create.change.' + FIELD.SEND_TIME,
        'app.record.edit.change.' + FIELD.DEADLINE,
        'app.record.edit.change.' + FIELD.DAYS_BEFORE,
        'app.record.edit.change.' + FIELD.SEND_TIME,
    ];

    kintone.events.on(CALC_EVENTS, (event) => {
        const record = event.record;
        const result = calculateScheduledDateTime({
            deadline: record[FIELD.DEADLINE].value,
            daysBeforeText: record[FIELD.DAYS_BEFORE].value,
            sendTime: record[FIELD.SEND_TIME].value,
        });

        if (result.error) {
            event.error = result.error;
            return event;
        }
        record[FIELD.SCHEDULED_AT].value = result.value;
        return event;
    });

    /** 新規保存時・編集保存時共通のバリデーション+算出 */
    function validateAndCalculate(record) {
        const result = calculateScheduledDateTime({
            deadline: record[FIELD.DEADLINE].value,
            daysBeforeText: record[FIELD.DAYS_BEFORE].value,
            sendTime: record[FIELD.SEND_TIME].value,
        });
        if (result.error) {
            throw new Error(result.error);
        }
        record[FIELD.SCHEDULED_AT].value = result.value;

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
            record[FIELD.SEND_STATUS].value = STATUS.UNSENT;
            record[FIELD.SEND_REQUEST].value = [];
            record[FIELD.SENT_AT].value = '';
            record[FIELD.ERROR_MESSAGE].value = '';
            if (!record[FIELD.SEND_COUNT].value) {
                record[FIELD.SEND_COUNT].value = '0';
            }
        } catch (error) {
            event.error = error.message;
        }
        return event;
    });

    kintone.events.on('app.record.edit.submit', (event) => {
        const record = event.record;
        try {
            validateAndCalculate(record);

            if (record[FIELD.SEND_STATUS].value === STATUS.PROCESSING) {
                throw new Error(MSGS.PROCESSING_LOCKED);
            }

            if (
                record[FIELD.SEND_STATUS].value === STATUS.SENT ||
                record[FIELD.SEND_STATUS].value === STATUS.ERROR
            ) {
                record[FIELD.SEND_STATUS].value = STATUS.UNSENT;
                record[FIELD.SEND_REQUEST].value = [];
                record[FIELD.SENT_AT].value = '';
                record[FIELD.ERROR_MESSAGE].value = '';
            }
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
        const currentStatus = record[FIELD.SEND_STATUS].value;
        if (currentStatus === STATUS.PROCESSING || currentStatus === STATUS.STOPPED) {
            return event;
        }

        const isResend = currentStatus === STATUS.SENT;
        const button = createSendButton(isResend);

        button.addEventListener('click', async () => {
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

            const confirmed = await confirmSend(recipientNames);
            if (!confirmed) {
                return;
            }

            setButtonSending(button);
            try {
                await requestImmediateSend({
                    appId: kintone.app.getId(),
                    recordId: kintone.app.record.getId(),
                    revision: record.$revision.value,
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
                resetButton(button, isResend);
            }
        });

        const headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
        if (headerSpace) {
            headerSpace.appendChild(button);
        }

        return event;
    });
})();
