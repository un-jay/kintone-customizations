// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : desktop.jsのユニットテスト(desktop.test.js)
//     Description : 「計算処理」セクションの純粋関数を検証する。
//                   desktop.jsはkintone.events.on()をトップレベルで呼ぶ単一ファイルのため、
//                   importする前にkintoneのダミーオブジェクトをグローバルへ用意しておく。
// ======================================================================

import { beforeAll, describe, expect, it } from 'vitest';

let calc;

beforeAll(async () => {
    globalThis.kintone = { events: { on: () => {} } };
    const imported = await import('../src/desktop.js');
    calc = imported.default || imported;
});

describe('computeResizedDimensions', () => {
    it('長辺が上限以下の場合は、元の寸法のまま返す', () => {
        expect(calc.computeResizedDimensions(800, 600, 1600)).toEqual({
            width: 800,
            height: 600,
        });
    });

    it('横長の画像は、幅を基準にアスペクト比を保ってリサイズする', () => {
        expect(calc.computeResizedDimensions(3200, 1600, 1600)).toEqual({
            width: 1600,
            height: 800,
        });
    });

    it('縦長の画像は、高さを基準にアスペクト比を保ってリサイズする', () => {
        expect(calc.computeResizedDimensions(1500, 3000, 1600)).toEqual({
            width: 800,
            height: 1600,
        });
    });

    it('リサイズ後の寸法が0以下にならない(最小1px)', () => {
        const result = calc.computeResizedDimensions(10000, 1, 1600);
        expect(result.width).toBe(1600);
        expect(result.height).toBeGreaterThanOrEqual(1);
    });
});

describe('dataUrlToBase64', () => {
    it('data URLからBase64部分だけを取り出す', () => {
        expect(calc.dataUrlToBase64('data:image/jpeg;base64,QUJD')).toBe('QUJD');
    });

    it('カンマが無い場合は、そのままの文字列を返す', () => {
        expect(calc.dataUrlToBase64('QUJD')).toBe('QUJD');
    });
});

describe('parseMeterVisionResponse', () => {
    const sampleResult = {
        meterType: 'analog',
        value: 6.4,
        unit: 'MPa',
        confidence: 'high',
        rawLabel: '目盛り0〜10の間、指針は6と7の間を指している',
    };

    it('ok:trueのレスポンスを解析し、resultを返す', () => {
        expect(
            calc.parseMeterVisionResponse(
                JSON.stringify({ ok: true, result: sampleResult }),
            ),
        ).toEqual({ ok: true, result: sampleResult, error: null });
    });

    it('ok:falseのレスポンスは、エラーメッセージを含めて返す', () => {
        expect(
            calc.parseMeterVisionResponse(
                JSON.stringify({ ok: false, error: '認証に失敗しました。' }),
            ),
        ).toEqual({ ok: false, result: null, error: '認証に失敗しました。' });
    });

    it('JSONとして解析できない場合は、専用のエラーメッセージを返す', () => {
        expect(calc.parseMeterVisionResponse('not a json')).toEqual({
            ok: false,
            result: null,
            error: calc.MSGS.RESPONSE_PARSE_FAILED,
        });
    });

    it('resultが無い場合は失敗として扱う', () => {
        expect(calc.parseMeterVisionResponse(JSON.stringify({ ok: true }))).toEqual({
            ok: false,
            result: null,
            error: calc.MSGS.UNKNOWN_ERROR,
        });
    });
});

describe('meterTypeToLabel', () => {
    it('analog/digitalを日本語の選択肢文言へ変換する', () => {
        expect(calc.meterTypeToLabel('analog')).toBe('アナログ');
        expect(calc.meterTypeToLabel('digital')).toBe('デジタル');
    });

    it('未判定(unknown・未知の値)は空文字を返す', () => {
        expect(calc.meterTypeToLabel('unknown')).toBe('');
        expect(calc.meterTypeToLabel(undefined)).toBe('');
    });
});

describe('confidenceToLabel', () => {
    it('high/medium/lowを日本語の選択肢文言へ変換する', () => {
        expect(calc.confidenceToLabel('high')).toBe('高');
        expect(calc.confidenceToLabel('medium')).toBe('中');
        expect(calc.confidenceToLabel('low')).toBe('低');
    });

    it('未知の値は空文字を返す', () => {
        expect(calc.confidenceToLabel('')).toBe('');
        expect(calc.confidenceToLabel(undefined)).toBe('');
    });
});

describe('shouldWarnLowConfidence', () => {
    it('mediumまたはlowのときtrueを返す', () => {
        expect(calc.shouldWarnLowConfidence('medium')).toBe(true);
        expect(calc.shouldWarnLowConfidence('low')).toBe(true);
    });

    it('highのときfalseを返す', () => {
        expect(calc.shouldWarnLowConfidence('high')).toBe(false);
    });
});

describe('normalizeNumberInputValue', () => {
    it('数値または数値文字列を文字列化する', () => {
        expect(calc.normalizeNumberInputValue(6.4)).toBe('6.4');
        expect(calc.normalizeNumberInputValue('6.4')).toBe('6.4');
    });

    it('null・undefined・空文字は空文字を返す(フィールドを空にする値)', () => {
        expect(calc.normalizeNumberInputValue(null)).toBe('');
        expect(calc.normalizeNumberInputValue(undefined)).toBe('');
        expect(calc.normalizeNumberInputValue('')).toBe('');
    });

    it('数値として解釈できない文字列は空文字を返す', () => {
        expect(calc.normalizeNumberInputValue('約6')).toBe('');
    });
});

describe('buildMeterTableRow', () => {
    const fields = {
        name: 'METER_NAME',
        type: 'METER_TYPE',
        value: 'METER_VALUE',
        unit: 'METER_UNIT',
        confidence: 'METER_CONFIDENCE',
        note: 'METER_NOTE',
        photo: 'METER_PHOTO',
    };

    it('入力値からテーブル行のvalueオブジェクトを組み立てる(フィールドタイプ付き)', () => {
        expect(
            calc.buildMeterTableRow(fields, {
                name: '1号ボイラー圧力計',
                meterTypeLabel: 'アナログ',
                value: 6.4,
                unit: 'MPa',
                confidenceLabel: '高',
                note: '目盛り0〜10、指針は6と7の間',
            }),
        ).toEqual({
            value: {
                METER_NAME: { type: 'SINGLE_LINE_TEXT', value: '1号ボイラー圧力計' },
                METER_TYPE: { type: 'DROP_DOWN', value: 'アナログ' },
                METER_VALUE: { type: 'NUMBER', value: '6.4' },
                METER_UNIT: { type: 'SINGLE_LINE_TEXT', value: 'MPa' },
                METER_CONFIDENCE: { type: 'DROP_DOWN', value: '高' },
                METER_NOTE: {
                    type: 'MULTI_LINE_TEXT',
                    value: '目盛り0〜10、指針は6と7の間',
                },
                METER_PHOTO: { type: 'FILE', value: [] },
            },
        });
    });

    it('未入力の項目は空文字で埋める', () => {
        const row = calc.buildMeterTableRow(fields, {});
        expect(row.value.METER_NAME.value).toBe('');
        expect(row.value.METER_TYPE.value).toBe('');
        expect(row.value.METER_VALUE.value).toBe('');
        expect(row.value.METER_UNIT.value).toBe('');
        expect(row.value.METER_CONFIDENCE.value).toBe('');
        expect(row.value.METER_NOTE.value).toBe('');
    });

    it('添付ファイル欄は省略せず、空配列のキーとして含める(省略すると行ごと無視されるため)', () => {
        const row = calc.buildMeterTableRow(fields, {});
        expect(row.value.METER_PHOTO).toEqual({ type: 'FILE', value: [] });
    });
});

describe('buildMeterAttachmentPatch', () => {
    it('保留中の行だけ写真を反映し、他の行はidのみで維持する', () => {
        const savedRecord = {
            METER_READINGS: {
                value: [
                    { id: '101', value: {} },
                    { id: '102', value: {} },
                    { id: '103', value: {} },
                ],
            },
        };
        const pending = [
            {
                tableField: 'METER_READINGS',
                photoField: 'METER_PHOTO',
                rowIndex: 1,
                fileKey: 'key-102',
            },
            {
                tableField: 'METER_READINGS',
                photoField: 'METER_PHOTO',
                rowIndex: 2,
                fileKey: 'key-103',
            },
        ];

        expect(calc.buildMeterAttachmentPatch(pending, savedRecord)).toEqual({
            METER_READINGS: {
                value: [
                    { id: '101' },
                    {
                        id: '102',
                        value: { METER_PHOTO: { value: [{ fileKey: 'key-102' }] } },
                    },
                    {
                        id: '103',
                        value: { METER_PHOTO: { value: [{ fileKey: 'key-103' }] } },
                    },
                ],
            },
        });
    });

    it('複数のテーブルにまたがる保留分もまとめて変換する', () => {
        const savedRecord = {
            TABLE_A: { value: [{ id: '1' }] },
            TABLE_B: { value: [{ id: '9' }] },
        };
        const pending = [
            {
                tableField: 'TABLE_A',
                photoField: 'PHOTO_A',
                rowIndex: 0,
                fileKey: 'key-a',
            },
            {
                tableField: 'TABLE_B',
                photoField: 'PHOTO_B',
                rowIndex: 0,
                fileKey: 'key-b',
            },
        ];

        expect(calc.buildMeterAttachmentPatch(pending, savedRecord)).toEqual({
            TABLE_A: {
                value: [
                    { id: '1', value: { PHOTO_A: { value: [{ fileKey: 'key-a' }] } } },
                ],
            },
            TABLE_B: {
                value: [
                    { id: '9', value: { PHOTO_B: { value: [{ fileKey: 'key-b' }] } } },
                ],
            },
        });
    });

    it('保留分が空の場合は空オブジェクトを返す', () => {
        expect(
            calc.buildMeterAttachmentPatch([], { METER_READINGS: { value: [] } }),
        ).toEqual({});
    });
});
