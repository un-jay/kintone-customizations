// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
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

describe('appendRecognizedText', () => {
    it('既存の値が空の場合は、認識結果をそのまま返す', () => {
        expect(calc.appendRecognizedText('', '本日の作業完了')).toBe('本日の作業完了');
        expect(calc.appendRecognizedText(undefined, '本日の作業完了')).toBe(
            '本日の作業完了',
        );
    });

    it('既存の値がある場合は、改行を挟んで末尾に追記する', () => {
        expect(calc.appendRecognizedText('午前:部品Aの組立', '午後:検品')).toBe(
            '午前:部品Aの組立\n午後:検品',
        );
    });

    it('認識結果が空文字の場合は、既存の値をそのまま返す(上書きしない)', () => {
        expect(calc.appendRecognizedText('午前:部品Aの組立', '')).toBe(
            '午前:部品Aの組立',
        );
        expect(calc.appendRecognizedText('午前:部品Aの組立', '   ')).toBe(
            '午前:部品Aの組立',
        );
    });

    it('認識結果・既存の値ともに空の場合は空文字を返す', () => {
        expect(calc.appendRecognizedText('', '')).toBe('');
        expect(calc.appendRecognizedText(undefined, undefined)).toBe('');
    });
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

describe('parseOcrResponse', () => {
    it('ok:trueのレスポンスを解析し、textを返す', () => {
        expect(
            calc.parseOcrResponse(JSON.stringify({ ok: true, text: '本日の作業完了' })),
        ).toEqual({ ok: true, text: '本日の作業完了', error: null });
    });

    it('ok:falseのレスポンスは、エラーメッセージを含めて返す', () => {
        expect(
            calc.parseOcrResponse(
                JSON.stringify({ ok: false, error: '認証に失敗しました。' }),
            ),
        ).toEqual({ ok: false, text: '', error: '認証に失敗しました。' });
    });

    it('JSONとして解析できない場合は、専用のエラーメッセージを返す', () => {
        expect(calc.parseOcrResponse('not a json')).toEqual({
            ok: false,
            text: '',
            error: calc.MSGS.RESPONSE_PARSE_FAILED,
        });
    });

    it('okフィールドが無い場合は失敗として扱う', () => {
        expect(calc.parseOcrResponse(JSON.stringify({ text: '本日の作業完了' }))).toEqual(
            { ok: false, text: '', error: calc.MSGS.UNKNOWN_ERROR },
        );
    });
});
