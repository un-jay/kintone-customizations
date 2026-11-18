// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/11/18        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : GeminiOcrClient.jsのユニットテスト(GeminiOcrClient.test.js)
//     Description : 副作用を持たない純粋関数(extractTextFromGeminiResponse /
//                   isRetryableStatusCode)を検証する。
// ======================================================================

import { describe, expect, it } from 'vitest';
import GeminiOcrClient from '../src/GeminiOcrClient.js';

const { extractTextFromGeminiResponse, isRetryableStatusCode, OCR_RESPONSE_SCHEMA } =
    GeminiOcrClient;

/** generateContentのレスポンス形式(構造化出力のJSON文字列がparts[].textに入る)を組み立てる */
function buildResponse(resultObject) {
    return {
        candidates: [{ content: { parts: [{ text: JSON.stringify(resultObject) }] } }],
    };
}

describe('extractTextFromGeminiResponse', () => {
    it('構造化出力のtextを取り出す(複数行はLF区切りのまま)', () => {
        const response = buildResponse({ text: '午前:部品Aの組立完了\n午後:検品予定' });
        expect(extractTextFromGeminiResponse(response)).toBe(
            '午前:部品Aの組立完了\n午後:検品予定',
        );
    });

    it('前後の空白・改行は除去する', () => {
        const response = buildResponse({ text: '\n  10月3日\n残り1部屋です。 \n' });
        expect(extractTextFromGeminiResponse(response)).toBe('10月3日\n残り1部屋です。');
    });

    it('textが空文字(文字が見当たらない)の場合は空文字を返す', () => {
        expect(extractTextFromGeminiResponse(buildResponse({ text: '' }))).toBe('');
    });

    it('textが文字列でない場合は空文字を返す', () => {
        expect(extractTextFromGeminiResponse(buildResponse({}))).toBe('');
        expect(extractTextFromGeminiResponse(buildResponse({ text: null }))).toBe('');
    });

    it('candidatesが無い・partsにテキストが無い場合はエラーにする', () => {
        expect(() => extractTextFromGeminiResponse({})).toThrow(
            'Gemini APIのレスポンスにテキストが含まれていません',
        );
        expect(() => extractTextFromGeminiResponse({ candidates: [] })).toThrow(
            'Gemini APIのレスポンスにテキストが含まれていません',
        );
        expect(() =>
            extractTextFromGeminiResponse({ candidates: [{ content: { parts: [] } }] }),
        ).toThrow('Gemini APIのレスポンスにテキストが含まれていません');
    });

    it('テキストが無い場合のエラーには、finishReasonを含める', () => {
        const response = { candidates: [{ finishReason: 'SAFETY' }] };
        expect(() => extractTextFromGeminiResponse(response)).toThrow('SAFETY');
    });
});

describe('isRetryableStatusCode', () => {
    it('503(高負荷)・429(レート制限)はリトライ対象', () => {
        expect(isRetryableStatusCode(503)).toBe(true);
        expect(isRetryableStatusCode(429)).toBe(true);
    });

    it('400/401/404/500等はリトライ対象外', () => {
        [200, 400, 401, 403, 404, 500].forEach((code) => {
            expect(isRetryableStatusCode(code)).toBe(false);
        });
    });
});

describe('OCR_RESPONSE_SCHEMA', () => {
    it('textを必須の文字列として定義している', () => {
        expect(OCR_RESPONSE_SCHEMA.properties.text.type).toBe('STRING');
        expect(OCR_RESPONSE_SCHEMA.required).toContain('text');
    });
});
