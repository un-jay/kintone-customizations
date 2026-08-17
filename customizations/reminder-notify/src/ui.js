// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更
// ----------------------------------------------------------------------
//     ModuleName  : UI処理(ui.js)
//     Description : DOM生成・ダイアログ表示・通知表示を行う。
//                   DOM操作を許可する唯一のファイル。API呼び出しは行わない。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.ReminderNotify;

    /**
     * 即時送信ボタンを生成する(まだ親要素へは追加しない)。
     * @param {boolean} isResend - 送信済みレコードへの再送かどうか
     * @returns {HTMLButtonElement}
     */
    function createSendButton(isResend) {
        const button = document.createElement('button');
        button.id = CONST.BUTTON_ID;
        button.className = 'kintoneplugin-button-normal';
        button.textContent = isResend ? CONST.UI.RESEND_BUTTON : CONST.UI.SEND_NOW_BUTTON;
        button.style.marginLeft = '8px';
        return button;
    }

    /** ボタンを「処理中」表示にする */
    function setButtonSending(button) {
        button.disabled = true;
        button.textContent = CONST.UI.SENDING_LABEL;
    }

    /**
     * ボタンを通常表示へ戻す。
     * @param {HTMLButtonElement} button
     * @param {boolean} isResend
     */
    function resetButton(button, isResend) {
        button.disabled = false;
        button.textContent = isResend ? CONST.UI.RESEND_BUTTON : CONST.UI.SEND_NOW_BUTTON;
    }

    /**
     * 送信確認ダイアログを表示する。
     * @param {string[]} recipientNames
     * @returns {Promise<boolean>} OKが押されたらtrue
     */
    async function confirmSend(recipientNames) {
        const bodyElm = document.createElement('div');

        const descElm = document.createElement('p');
        descElm.textContent = CONST.UI.CONFIRM_DESC_PREFIX;
        bodyElm.appendChild(descElm);

        const listElm = document.createElement('ul');
        recipientNames.forEach((name) => {
            const itemElm = document.createElement('li');
            itemElm.textContent = name;
            listElm.appendChild(itemElm);
        });
        bodyElm.appendChild(listElm);

        const dialog = await kintone.createDialog({
            title: CONST.UI.CONFIRM_TITLE,
            body: bodyElm,
            okButtonText: CONST.UI.CONFIRM_OK,
            showCancelButton: true,
            cancelButtonText: CONST.UI.CONFIRM_CANCEL,
            showCloseButton: false,
        });

        const action = await dialog.show();
        return action === 'OK';
    }

    /**
     * kintone通知でメッセージを表示する。
     * @param {string} text
     */
    function notify(text) {
        kintone.showNotification({ text });
    }

    CONST.createSendButton = createSendButton;
    CONST.setButtonSending = setButtonSending;
    CONST.resetButton = resetButton;
    CONST.confirmSend = confirmSend;
    CONST.notify = notify;
})(window);
