// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更
// ----------------------------------------------------------------------
//     ModuleName  : 計算処理(calc.js)
//     Description : 送信予定日時の算出・送信先バリデーション。
//                   DOM操作・API呼び出し・副作用は行わない純粋関数のみを置く。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.ReminderNotify;

    /**
     * 納期・何日前・送信時刻から送信予定日時(ISO文字列)を算出する。
     * @param {Object} params
     * @param {string} params.deadline      - 納期(YYYY-MM-DD)
     * @param {string} params.daysBeforeText - 何日前に送るか(文字列の整数)
     * @param {string} params.sendTime      - 送信時刻(HH:mm)
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
            return { value: '', error: CONST.MSGS.INVALID_DAYS_BEFORE };
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
            return { valid: false, error: CONST.MSGS.NO_RECIPIENTS };
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

    CONST.calculateScheduledDateTime = calculateScheduledDateTime;
    CONST.validateRecipients = validateRecipients;
    CONST.extractRecipientCodes = extractRecipientCodes;
    CONST.buildRecipientDisplayNames = buildRecipientDisplayNames;
})(window);
