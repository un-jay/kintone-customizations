// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : calc.jsのユニットテスト(calc.test.js)
//     Description : parseTargetFields/splitScannedValue/parseBarcodeFormats
//                   (いずれもDOM操作・副作用を持たない純粋関数)を検証する。
//                   manifest.jsonの読み込み順(constant.js→calc.js)と同じ順で
//                   importし、window.CodeReaderPlugin配下の関数をテストする。
// ======================================================================

import { beforeAll, describe, expect, it } from 'vitest';
import '../src/js/constant.js';
import '../src/js/calc.js';

let CONST;

beforeAll(() => {
    CONST = window.CodeReaderPlugin;
});

describe('parseTargetFields', () => {
    it('未入力(空文字・null・undefined)の場合は空配列を返す', () => {
        expect(CONST.parseTargetFields('')).toEqual([]);
        expect(CONST.parseTargetFields(null)).toEqual([]);
        expect(CONST.parseTargetFields(undefined)).toEqual([]);
    });

    it('不正なJSON文字列の場合は空配列を返す', () => {
        expect(CONST.parseTargetFields('{invalid json')).toEqual([]);
    });

    it('JSON配列でない場合(オブジェクト等)は空配列を返す', () => {
        expect(CONST.parseTargetFields('{"fieldCode":"SEIBAN"}')).toEqual([]);
    });

    it('正しいJSON配列を対象フィールド配列へ変換する', () => {
        const json = JSON.stringify([
            { fieldCode: 'SEIBAN', length: 6 },
            { fieldCode: 'HINMOKU_ID', length: null },
        ]);
        expect(CONST.parseTargetFields(json)).toEqual([
            { fieldCode: 'SEIBAN', length: 6 },
            { fieldCode: 'HINMOKU_ID', length: null },
        ]);
    });
});

describe('splitScannedValue', () => {
    it('splitMode=NONEの場合は分割せず、そのまま1要素の配列で返す', () => {
        const result = CONST.splitScannedValue('ABC123', {
            splitMode: CONST.SPLIT_MODE.NONE,
            delimiter: '',
            targetFields: [{ fieldCode: 'FIELD1', length: null }],
        });
        expect(result).toEqual(['ABC123']);
    });

    it('splitMode=DELIMITERの場合、区切り文字で分割する', () => {
        const result = CONST.splitScannedValue('123-456-789', {
            splitMode: CONST.SPLIT_MODE.DELIMITER,
            delimiter: '-',
            targetFields: [
                { fieldCode: 'FIELD1', length: null },
                { fieldCode: 'FIELD2', length: null },
                { fieldCode: 'FIELD3', length: null },
            ],
        });
        expect(result).toEqual(['123', '456', '789']);
    });

    it('splitMode=DELIMITERでもdelimiterが空の場合は分割せずそのまま返す', () => {
        const result = CONST.splitScannedValue('123-456', {
            splitMode: CONST.SPLIT_MODE.DELIMITER,
            delimiter: '',
            targetFields: [{ fieldCode: 'FIELD1', length: null }],
        });
        expect(result).toEqual(['123-456']);
    });

    it('splitMode=FIXED_LENGTHの場合、指定した桁数で先頭から分割する', () => {
        // 実際の利用例(CLAUDE.mdのサンプル値)に合わせたケース: 6+1+2+1+1桁
        const result = CONST.splitScannedValue('12345678901', {
            splitMode: CONST.SPLIT_MODE.FIXED_LENGTH,
            delimiter: '',
            targetFields: [
                { fieldCode: 'SEIBAN', length: 6 },
                { fieldCode: 'HINMOKU_ID', length: 1 },
                { fieldCode: 'BUMON_ID', length: 2 },
                { fieldCode: 'SAKUZU_ID', length: 1 },
                { fieldCode: 'SAKUZU_SUB_ID', length: 1 },
            ],
        });
        expect(result).toEqual(['123456', '7', '89', '0', '1']);
    });

    it('splitMode=FIXED_LENGTHでlengthが0/未入力の行は残り全部を書き込む', () => {
        const result = CONST.splitScannedValue('ABC12345', {
            splitMode: CONST.SPLIT_MODE.FIXED_LENGTH,
            delimiter: '',
            targetFields: [
                { fieldCode: 'FIELD1', length: 3 },
                { fieldCode: 'FIELD2', length: null },
            ],
        });
        expect(result).toEqual(['ABC', '12345']);
    });
});

describe('parseBarcodeFormats', () => {
    it('未入力(空文字・null)の場合は空配列を返す', () => {
        expect(CONST.parseBarcodeFormats('')).toEqual([]);
        expect(CONST.parseBarcodeFormats(null)).toEqual([]);
    });

    it('カンマ区切り文字列をトリムして配列へ変換する', () => {
        expect(
            CONST.parseBarcodeFormats('code_39_reader, code_128_reader ,ean_reader'),
        ).toEqual(['code_39_reader', 'code_128_reader', 'ean_reader']);
    });

    it('空要素(連続するカンマ等)は除外する', () => {
        expect(CONST.parseBarcodeFormats('code_39_reader,,code_128_reader,')).toEqual([
            'code_39_reader',
            'code_128_reader',
        ]);
    });
});
