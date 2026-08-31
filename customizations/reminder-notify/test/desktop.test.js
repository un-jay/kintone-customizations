// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : desktop.jsのユニットテスト(desktop.test.js)
//     Description : 「計算処理」セクションの純粋関数を検証する。
//                   desktop.jsはkintone.events.on()をトップレベルで呼ぶ単一ファイルのため、
//                   importする前にkintoneのダミーオブジェクトをグローバルへ用意しておく
//                   (テストが呼ぶのは計算処理の純粋関数のみで、イベント本体は発火させない)。
// ======================================================================

import { beforeAll, describe, expect, it } from 'vitest';

let calc;

beforeAll(async () => {
    globalThis.kintone = { events: { on: () => {} } };
    const imported = await import('../src/desktop.js');
    calc = imported.default || imported;
});

describe('calculateScheduledDateTime', () => {
    it('納期・何日前・送信時刻のいずれかが未入力の場合は空文字を返す(エラーにはしない)', () => {
        expect(
            calc.calculateScheduledDateTime({
                deadline: '',
                daysBeforeText: '3',
                sendTime: '09:00',
            }),
        ).toEqual({ value: '', error: null });
        expect(
            calc.calculateScheduledDateTime({
                deadline: '2026-09-10',
                daysBeforeText: undefined,
                sendTime: '09:00',
            }),
        ).toEqual({ value: '', error: null });
        expect(
            calc.calculateScheduledDateTime({
                deadline: '2026-09-10',
                daysBeforeText: '3',
                sendTime: '',
            }),
        ).toEqual({ value: '', error: null });
    });

    it('何日前が負数の場合はエラーを返す', () => {
        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-10',
            daysBeforeText: '-1',
            sendTime: '09:00',
        });
        expect(result.value).toBe('');
        expect(result.error).toBe(calc.MSGS.INVALID_DAYS_BEFORE);
    });

    it('何日前が整数でない場合はエラーを返す', () => {
        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-10',
            daysBeforeText: '1.5',
            sendTime: '09:00',
        });
        expect(result.value).toBe('');
        expect(result.error).toBe(calc.MSGS.INVALID_DAYS_BEFORE);
    });

    it('納期から何日前かを引いた送信予定日時(ISO文字列)を算出する(月をまたぐケース)', () => {
        // 納期2026-09-02の5日前 → 2026-08-28(月をまたぐ)。
        // タイムゾーンに依存しないよう、実装と同じDate計算方法で期待値を作る。
        const expectedDate = new Date(2026, 8, 2, 9, 0, 0, 0);
        expectedDate.setDate(expectedDate.getDate() - 5);

        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-02',
            daysBeforeText: '5',
            sendTime: '09:00',
        });
        expect(result.error).toBeNull();
        expect(result.value).toBe(expectedDate.toISOString());
    });

    it('何日前=0の場合は納期当日の送信時刻をそのまま算出する', () => {
        const expectedDate = new Date(2026, 8, 10, 18, 30, 0, 0);
        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-10',
            daysBeforeText: '0',
            sendTime: '18:30',
        });
        expect(result.error).toBeNull();
        expect(result.value).toBe(expectedDate.toISOString());
    });
});

describe('validateRecipients', () => {
    it('送信先テーブルが空・未定義の場合は不正とする', () => {
        expect(validateRecipientsWrapper([])).toEqual({
            valid: false,
            error: expectNoRecipientsError(),
        });
        expect(validateRecipientsWrapper(undefined)).toEqual({
            valid: false,
            error: expectNoRecipientsError(),
        });
    });

    it('送信先コードがすべて空欄の行しかない場合は不正とする', () => {
        const rows = [
            { value: { RecipientCode: { value: '' } } },
            { value: { RecipientCode: { value: '' } } },
        ];
        expect(validateRecipientsWrapper(rows)).toEqual({
            valid: false,
            error: expectNoRecipientsError(),
        });
    });

    it('送信先コードが1件以上入力されていれば有効とする', () => {
        const rows = [
            { value: { RecipientCode: { value: '' } } },
            { value: { RecipientCode: { value: 'U001' } } },
        ];
        expect(validateRecipientsWrapper(rows)).toEqual({ valid: true, error: null });
    });

    function validateRecipientsWrapper(rows) {
        return calc.validateRecipients(rows, 'RecipientCode');
    }

    function expectNoRecipientsError() {
        return calc.MSGS.NO_RECIPIENTS;
    }
});

describe('extractRecipientCodes', () => {
    it('送信先コードが空欄の行を除外して配列で返す', () => {
        const rows = [
            { value: { RecipientCode: { value: 'U001' } } },
            { value: { RecipientCode: { value: '' } } },
            { value: { RecipientCode: { value: 'U002' } } },
        ];
        expect(calc.extractRecipientCodes(rows, 'RecipientCode')).toEqual([
            'U001',
            'U002',
        ]);
    });

    it('送信先テーブルが未定義の場合は空配列を返す', () => {
        expect(calc.extractRecipientCodes(undefined, 'RecipientCode')).toEqual([]);
    });
});

describe('buildRecipientDisplayNames', () => {
    it('送信先名が未入力の行は送信先コードで代替する', () => {
        const rows = [
            {
                value: {
                    RecipientName: { value: '山田太郎' },
                    RecipientCode: { value: 'U001' },
                },
            },
            {
                value: {
                    RecipientName: { value: '' },
                    RecipientCode: { value: 'U002' },
                },
            },
        ];
        expect(
            calc.buildRecipientDisplayNames(rows, 'RecipientName', 'RecipientCode'),
        ).toEqual(['山田太郎', 'U002']);
    });

    it('送信先名・送信先コードのどちらも未入力の行は除外する', () => {
        const rows = [
            {
                value: {
                    RecipientName: { value: '' },
                    RecipientCode: { value: '' },
                },
            },
        ];
        expect(
            calc.buildRecipientDisplayNames(rows, 'RecipientName', 'RecipientCode'),
        ).toEqual([]);
    });
});
