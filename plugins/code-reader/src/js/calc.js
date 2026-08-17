// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : 計算処理(calc.js)
//     Description : 読み取り結果の分割処理。
//                   DOM操作・API呼び出し・副作用は行わない純粋関数のみを置く。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.CodeReaderPlugin;

    /**
     * 設定画面で保存したJSON文字列を、対象フィールド配列へ変換する。
     * 不正なJSONの場合は空配列を返す。
     * @param {string} json
     * @returns {Array<{fieldCode: string, length: number|null}>}
     */
    function parseTargetFields(json) {
        if (!json) {
            return [];
        }
        try {
            const parsed = JSON.parse(json);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * 読み取ったコードを、設定に応じて対象フィールドの数だけ分割する。
     * @param {string} code - 読み取ったコード文字列
     * @param {Object} params
     * @param {string} params.splitMode  - CONST.SPLIT_MODE のいずれか
     * @param {string} params.delimiter  - splitMode=DELIMITER のときに使う区切り文字
     * @param {Array<{fieldCode: string, length: number|null}>} params.targetFields
     * @returns {string[]} 対象フィールドと同じ並び順の値配列(該当する値がない要素はundefined)
     */
    function splitScannedValue(code, { splitMode, delimiter, targetFields }) {
        const SPLIT_MODE = CONST.SPLIT_MODE;

        if (splitMode === SPLIT_MODE.DELIMITER && delimiter) {
            return code.split(delimiter);
        }

        if (splitMode === SPLIT_MODE.FIXED_LENGTH) {
            const parts = [];
            let offset = 0;
            targetFields.forEach(({ length }) => {
                const size = Number(length) > 0 ? Number(length) : code.length - offset;
                parts.push(code.slice(offset, offset + size));
                offset += size;
            });
            return parts;
        }

        // SPLIT_MODE.NONE、またはフォールバック: 分割せず先頭フィールドへそのまま書き込む
        return [code];
    }

    CONST.parseTargetFields = parseTargetFields;
    CONST.splitScannedValue = splitScannedValue;
})(window);
