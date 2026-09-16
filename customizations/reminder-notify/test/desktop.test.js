// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/13        J.Yamamoto      :ReminderSchedulesテーブル対応に伴い、
//                                                pickUnsentScheduleRows/
//                                                buildScheduleDisplayLabelsのテストを追加
//  V1.2.0     2026/09/16        J.Yamamoto      :validateAndCalculateのテストを追加
//                                                (ReminderSchedules0行時のエラー等、
//                                                実機のテーブル初期表示行があると
//                                                手動確認が難しいケースを自動テストで担保)
//  V1.3.0     2026/09/16        J.Yamamoto      :hasToRecipientのテストを追加
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
        expect(result.value).toBe(expectedDate.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    });

    it('何日前=0の場合は納期当日の送信時刻をそのまま算出する', () => {
        const expectedDate = new Date(2026, 8, 10, 18, 30, 0, 0);
        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-10',
            daysBeforeText: '0',
            sendTime: '18:30',
        });
        expect(result.error).toBeNull();
        expect(result.value).toBe(expectedDate.toISOString().replace(/\.\d{3}Z$/, 'Z'));
    });

    it('返り値にミリ秒を含まない(kintoneの日時フィールドの値と形式を一致させるため)', () => {
        const result = calc.calculateScheduledDateTime({
            deadline: '2026-09-10',
            daysBeforeText: '0',
            sendTime: '18:30',
        });
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
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
            { value: { RECIPIENT_CODE: { value: '' } } },
            { value: { RECIPIENT_CODE: { value: '' } } },
        ];
        expect(validateRecipientsWrapper(rows)).toEqual({
            valid: false,
            error: expectNoRecipientsError(),
        });
    });

    it('送信先コードが1件以上入力されていれば有効とする', () => {
        const rows = [
            { value: { RECIPIENT_CODE: { value: '' } } },
            { value: { RECIPIENT_CODE: { value: 'U001' } } },
        ];
        expect(validateRecipientsWrapper(rows)).toEqual({ valid: true, error: null });
    });

    function validateRecipientsWrapper(rows) {
        return calc.validateRecipients(rows, 'RECIPIENT_CODE');
    }

    function expectNoRecipientsError() {
        return calc.MSGS.NO_RECIPIENTS;
    }
});

describe('hasToRecipient', () => {
    it('区分が「TO」の宛先が1件でもあれば有効とする', () => {
        const rows = [
            {
                value: {
                    RECIPIENT_CODE: { value: 'U001' },
                    RECIPIENT_TYPE: { value: 'CC' },
                },
            },
            {
                value: {
                    RECIPIENT_CODE: { value: 'U002' },
                    RECIPIENT_TYPE: { value: 'TO' },
                },
            },
        ];
        expect(calc.hasToRecipient(rows, 'RECIPIENT_CODE', 'RECIPIENT_TYPE')).toBe(true);
    });

    it('区分が未入力の行はTO扱いにする(GAS側Mailer.jsの既定動作と合わせるため)', () => {
        const rows = [{ value: { RECIPIENT_CODE: { value: 'U001' } } }];
        expect(calc.hasToRecipient(rows, 'RECIPIENT_CODE', 'RECIPIENT_TYPE')).toBe(true);
    });

    it('送信先が全てCC/BCCの場合は不正とする', () => {
        const rows = [
            {
                value: {
                    RECIPIENT_CODE: { value: 'U001' },
                    RECIPIENT_TYPE: { value: 'CC' },
                },
            },
            {
                value: {
                    RECIPIENT_CODE: { value: 'U002' },
                    RECIPIENT_TYPE: { value: 'BCC' },
                },
            },
        ];
        expect(calc.hasToRecipient(rows, 'RECIPIENT_CODE', 'RECIPIENT_TYPE')).toBe(false);
    });

    it('送信先コードが空欄の行は区分がTOでも対象にしない', () => {
        const rows = [
            { value: { RECIPIENT_CODE: { value: '' }, RECIPIENT_TYPE: { value: 'TO' } } },
        ];
        expect(calc.hasToRecipient(rows, 'RECIPIENT_CODE', 'RECIPIENT_TYPE')).toBe(false);
    });

    it('送信先テーブルが未定義の場合は不正とする', () => {
        expect(calc.hasToRecipient(undefined, 'RECIPIENT_CODE', 'RECIPIENT_TYPE')).toBe(
            false,
        );
    });
});

describe('extractRecipientCodes', () => {
    it('送信先コードが空欄の行を除外して配列で返す', () => {
        const rows = [
            { value: { RECIPIENT_CODE: { value: 'U001' } } },
            { value: { RECIPIENT_CODE: { value: '' } } },
            { value: { RECIPIENT_CODE: { value: 'U002' } } },
        ];
        expect(calc.extractRecipientCodes(rows, 'RECIPIENT_CODE')).toEqual([
            'U001',
            'U002',
        ]);
    });

    it('送信先テーブルが未定義の場合は空配列を返す', () => {
        expect(calc.extractRecipientCodes(undefined, 'RECIPIENT_CODE')).toEqual([]);
    });
});

describe('buildRecipientDisplayNames', () => {
    it('送信先名が未入力の行は送信先コードで代替する', () => {
        const rows = [
            {
                value: {
                    RECIPIENT_NAME: { value: '山田太郎' },
                    RECIPIENT_CODE: { value: 'U001' },
                },
            },
            {
                value: {
                    RECIPIENT_NAME: { value: '' },
                    RECIPIENT_CODE: { value: 'U002' },
                },
            },
        ];
        expect(
            calc.buildRecipientDisplayNames(rows, 'RECIPIENT_NAME', 'RECIPIENT_CODE'),
        ).toEqual(['山田太郎', 'U002']);
    });

    it('送信先名・送信先コードのどちらも未入力の行は除外する', () => {
        const rows = [
            {
                value: {
                    RECIPIENT_NAME: { value: '' },
                    RECIPIENT_CODE: { value: '' },
                },
            },
        ];
        expect(
            calc.buildRecipientDisplayNames(rows, 'RECIPIENT_NAME', 'RECIPIENT_CODE'),
        ).toEqual([]);
    });
});

describe('pickUnsentScheduleRows', () => {
    it('SEND_STATUSが「未送信」の行だけを抽出する', () => {
        const rows = [
            { id: '1', value: { SEND_STATUS: { value: '未送信' } } },
            { id: '2', value: { SEND_STATUS: { value: '送信済み' } } },
            { id: '3', value: { SEND_STATUS: { value: '未送信' } } },
        ];
        const result = calc.pickUnsentScheduleRows(rows, 'SEND_STATUS', '未送信');
        expect(result.map((row) => row.id)).toEqual(['1', '3']);
    });

    it('未送信の行が無ければ空配列を返す', () => {
        const rows = [{ id: '1', value: { SEND_STATUS: { value: '送信済み' } } }];
        expect(calc.pickUnsentScheduleRows(rows, 'SEND_STATUS', '未送信')).toEqual([]);
    });

    it('行が未定義の場合は空配列を返す', () => {
        expect(calc.pickUnsentScheduleRows(undefined, 'SEND_STATUS', '未送信')).toEqual(
            [],
        );
    });
});

describe('buildScheduleDisplayLabels', () => {
    it('何日前・送信時刻から表示ラベルを組み立てる', () => {
        const rows = [
            { value: { DAYS_BEFORE: { value: '7' }, SEND_TIME: { value: '09:00' } } },
            { value: { DAYS_BEFORE: { value: '1' }, SEND_TIME: { value: '17:30' } } },
        ];
        expect(calc.buildScheduleDisplayLabels(rows, 'DAYS_BEFORE', 'SEND_TIME')).toEqual(
            ['7日前(09:00)', '1日前(17:30)'],
        );
    });

    it('行が未定義の場合は空配列を返す', () => {
        expect(
            calc.buildScheduleDisplayLabels(undefined, 'DAYS_BEFORE', 'SEND_TIME'),
        ).toEqual([]);
    });
});

describe('shouldResetSendStatus', () => {
    it('送信済みの行で、送信予定日時が実際に変わった場合はtrueを返す', () => {
        expect(
            calc.shouldResetSendStatus(
                '送信済み',
                '2026-09-01T00:00:00.000Z',
                '2026-09-05T00:00:00.000Z',
            ),
        ).toBe(true);
    });

    it('エラーの行で、送信予定日時が実際に変わった場合はtrueを返す', () => {
        expect(
            calc.shouldResetSendStatus(
                'エラー',
                '2026-09-01T00:00:00.000Z',
                '2026-09-05T00:00:00.000Z',
            ),
        ).toBe(true);
    });

    it('送信予定日時が変わっていない場合は、無関係な項目の編集で保存してもfalseを返す', () => {
        expect(
            calc.shouldResetSendStatus(
                '送信済み',
                '2026-09-01T00:00:00.000Z',
                '2026-09-01T00:00:00.000Z',
            ),
        ).toBe(false);
    });

    it('未送信・送信処理中の行は、送信予定日時が変わってもfalseを返す(対象外)', () => {
        expect(
            calc.shouldResetSendStatus(
                '未送信',
                '2026-09-01T00:00:00.000Z',
                '2026-09-05T00:00:00.000Z',
            ),
        ).toBe(false);
        expect(
            calc.shouldResetSendStatus(
                '送信処理中',
                '2026-09-01T00:00:00.000Z',
                '2026-09-05T00:00:00.000Z',
            ),
        ).toBe(false);
    });
});

describe('validateAndCalculate', () => {
    it('ReminderSchedulesが0行の場合はエラーを投げる(実機ではテーブルに初期表示行があり手動確認が難しいケース)', () => {
        const record = {
            DEADLINE: { value: '2026-09-10' },
            REMINDER_SCHEDULES: { value: [] },
            RECIPIENTS: { value: [{ value: { RECIPIENT_CODE: { value: 'U001' } } }] },
        };
        expect(() => calc.validateAndCalculate(record)).toThrow(calc.MSGS.NO_SCHEDULES);
    });

    it('送信先に有効なコードが1件も無い場合はエラーを投げる', () => {
        const record = {
            DEADLINE: { value: '2026-09-10' },
            REMINDER_SCHEDULES: {
                value: [
                    {
                        value: {
                            DAYS_BEFORE: { value: '3' },
                            SEND_TIME: { value: '09:00' },
                            SCHEDULED_SEND_AT: { value: '' },
                        },
                    },
                ],
            },
            RECIPIENTS: { value: [{ value: { RECIPIENT_CODE: { value: '' } } }] },
        };
        expect(() => calc.validateAndCalculate(record)).toThrow(calc.MSGS.NO_RECIPIENTS);
    });

    it('送信先が全てCC/BCCの場合はエラーを投げる(送信時までTO不足に気付けないのを防ぐ)', () => {
        const record = {
            DEADLINE: { value: '2026-09-10' },
            REMINDER_SCHEDULES: {
                value: [
                    {
                        value: {
                            DAYS_BEFORE: { value: '3' },
                            SEND_TIME: { value: '09:00' },
                            SCHEDULED_SEND_AT: { value: '' },
                        },
                    },
                ],
            },
            RECIPIENTS: {
                value: [
                    {
                        value: {
                            RECIPIENT_CODE: { value: 'U001' },
                            RECIPIENT_TYPE: { value: 'CC' },
                        },
                    },
                ],
            },
        };
        expect(() => calc.validateAndCalculate(record)).toThrow(
            calc.MSGS.NO_TO_RECIPIENT,
        );
    });

    it('入力が正しい場合はエラーを投げず、各行のSCHEDULED_SEND_ATを算出する', () => {
        const row = {
            value: {
                DAYS_BEFORE: { value: '3' },
                SEND_TIME: { value: '09:00' },
                SCHEDULED_SEND_AT: { value: '' },
            },
        };
        const record = {
            DEADLINE: { value: '2026-09-10' },
            REMINDER_SCHEDULES: { value: [row] },
            RECIPIENTS: { value: [{ value: { RECIPIENT_CODE: { value: 'U001' } } }] },
        };
        expect(() => calc.validateAndCalculate(record)).not.toThrow();
        expect(row.value.SCHEDULED_SEND_AT.value).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        );
    });
});
