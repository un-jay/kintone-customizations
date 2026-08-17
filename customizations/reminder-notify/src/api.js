// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更、
//                                                固定フィールドコード(CONST.FIELD)を使用
// ----------------------------------------------------------------------
//     ModuleName  : REST API処理(api.js)
//     Description : kintone REST APIの呼び出しのみを行う。DOM操作・計算処理は行わない。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.ReminderNotify;

    /**
     * 即時送信要求を登録する(対象レコードのSendRequest/SendStatus/ErrorMessageを更新)。
     * @param {Object} params
     * @param {number} params.appId
     * @param {number} params.recordId
     * @param {string} params.revision
     * @returns {Promise<Object>} kintone REST APIのレスポンス
     */
    async function requestImmediateSend({ appId, recordId, revision }) {
        const FIELD = CONST.FIELD;
        const params = {
            app: appId,
            id: recordId,
            revision,
            record: {
                [FIELD.SEND_REQUEST]: { value: [CONST.SEND_REQUEST_VALUE] },
                [FIELD.SEND_STATUS]: { value: CONST.STATUS.UNSENT },
                [FIELD.ERROR_MESSAGE]: { value: '' },
            },
        };

        return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', params);
    }

    CONST.requestImmediateSend = requestImmediateSend;
})(window);
