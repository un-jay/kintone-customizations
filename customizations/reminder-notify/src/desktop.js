// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更、
//                                                固定フィールドコード(CONST.FIELD)を使用
// ----------------------------------------------------------------------
//     ModuleName  : メイン処理(desktop.js)
//     Description : イベント制御のみを行う(イベント登録→api.js/calc.js/ui.js)。
//                   API処理・DOM操作・計算処理はここでは行わない。
//                   対象アプリはCONST.FIELD(constant.js)のフィールドコードで
//                   作成されている前提。フィールド一覧はCLAUDE.mdを参照。
// ======================================================================

(() => {
    'use strict';

    const CONST = window.ReminderNotify;
    const FIELD = CONST.FIELD;

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
        const result = CONST.calculateScheduledDateTime({
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
        const result = CONST.calculateScheduledDateTime({
            deadline: record[FIELD.DEADLINE].value,
            daysBeforeText: record[FIELD.DAYS_BEFORE].value,
            sendTime: record[FIELD.SEND_TIME].value,
        });
        if (result.error) {
            throw new Error(result.error);
        }
        record[FIELD.SCHEDULED_AT].value = result.value;

        const recipientCheck = CONST.validateRecipients(
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
            record[FIELD.SEND_STATUS].value = CONST.STATUS.UNSENT;
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

            if (record[FIELD.SEND_STATUS].value === CONST.STATUS.PROCESSING) {
                throw new Error(CONST.MSGS.PROCESSING_LOCKED);
            }

            if (
                record[FIELD.SEND_STATUS].value === CONST.STATUS.SENT ||
                record[FIELD.SEND_STATUS].value === CONST.STATUS.ERROR
            ) {
                record[FIELD.SEND_STATUS].value = CONST.STATUS.UNSENT;
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
        if (document.getElementById(CONST.BUTTON_ID)) {
            return event;
        }

        const record = event.record;
        const currentStatus = record[FIELD.SEND_STATUS].value;
        if (
            currentStatus === CONST.STATUS.PROCESSING ||
            currentStatus === CONST.STATUS.STOPPED
        ) {
            return event;
        }

        const isResend = currentStatus === CONST.STATUS.SENT;
        const button = CONST.createSendButton(isResend);

        button.addEventListener('click', async () => {
            const recipientRows = record[FIELD.RECIPIENTS].value || [];
            const recipientCodes = CONST.extractRecipientCodes(
                recipientRows,
                FIELD.RECIPIENT_CODE,
            );

            if (recipientCodes.length === 0) {
                CONST.notify(CONST.UI.NOTIFY_NO_RECIPIENTS);
                return;
            }

            const recipientNames = CONST.buildRecipientDisplayNames(
                recipientRows,
                FIELD.RECIPIENT_NAME,
                FIELD.RECIPIENT_CODE,
            );

            const confirmed = await CONST.confirmSend(recipientNames);
            if (!confirmed) {
                return;
            }

            CONST.setButtonSending(button);
            try {
                await CONST.requestImmediateSend({
                    appId: kintone.app.getId(),
                    recordId: kintone.app.record.getId(),
                    revision: record.$revision.value,
                });
                CONST.notify(CONST.UI.NOTIFY_SUCCESS);
                window.location.reload();
            } catch (error) {
                console.error(error);
                CONST.notify(
                    CONST.MSGS.SEND_REQUEST_FAILED +
                        '\n' +
                        (error.message || JSON.stringify(error)),
                );
                CONST.resetButton(button, isResend);
            }
        });

        const headerSpace = kintone.app.record.getHeaderMenuSpaceElement();
        if (headerSpace) {
            headerSpace.appendChild(button);
        }

        return event;
    });
})();
