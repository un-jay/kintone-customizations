// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/28        J.Yamamoto      :isRetryableStatusCodeのテストを追加
// ----------------------------------------------------------------------
//     ModuleName  : GeminiVisionClient.jsのユニットテスト(GeminiVisionClient.test.js)
//     Description : extractMeterResultFromResponse・isRetryableStatusCode(いずれも
//                   副作用を持たない純粋関数)を検証する。レスポンスの構造は、
//                   generateContentのcandidates[].content.parts[].textに構造化出力
//                   (JSON文字列)が入る、Gemini APIの標準的なレスポンスの形
//                   (responseMimeType: "application/json"指定時)を前提にしている。
// ======================================================================

import { describe, expect, it } from 'vitest';
import GeminiVisionClient from '../src/GeminiVisionClient.js';

const { extractMeterResultFromResponse, isRetryableStatusCode } = GeminiVisionClient;

function buildResponse(resultObject) {
    return {
        candidates: [
            {
                content: {
                    parts: [{ text: JSON.stringify(resultObject) }],
                },
            },
        ],
    };
}

describe('extractMeterResultFromResponse', () => {
    it('構造化出力(JSON文字列)を解析し、読み取り結果を返す', () => {
        const response = buildResponse({
            meterType: 'analog',
            value: 6.4,
            unit: 'MPa',
            confidence: 'high',
            rawLabel: '目盛り0〜10の間、指針は6と7の間を指している',
        });
        expect(extractMeterResultFromResponse(response)).toEqual({
            meterType: 'analog',
            value: 6.4,
            unit: 'MPa',
            confidence: 'high',
            rawLabel: '目盛り0〜10の間、指針は6と7の間を指している',
        });
    });

    it('デジタル表示の結果も同様に解析する', () => {
        const response = buildResponse({
            meterType: 'digital',
            value: 128,
            unit: 'kWh',
            confidence: 'high',
            rawLabel: '液晶表示に「128」と表示されている',
        });
        expect(extractMeterResultFromResponse(response).meterType).toBe('digital');
        expect(extractMeterResultFromResponse(response).value).toBe(128);
    });

    it('valueが数値でない場合はnullへ正規化する', () => {
        const response = buildResponse({
            meterType: 'unknown',
            value: null,
            unit: '',
            confidence: 'low',
            rawLabel: '計器が写っていない',
        });
        expect(extractMeterResultFromResponse(response).value).toBeNull();
    });

    it('meterType・unit・confidence・rawLabelが欠けている場合は既定値を補う', () => {
        const response = buildResponse({ value: 12 });
        expect(extractMeterResultFromResponse(response)).toEqual({
            meterType: 'unknown',
            value: 12,
            unit: '',
            confidence: 'low',
            rawLabel: '',
        });
    });

    it('candidatesが無い・textが取り出せない場合は例外を投げる', () => {
        expect(() => extractMeterResultFromResponse({})).toThrow();
        expect(() =>
            extractMeterResultFromResponse({ candidates: [{ content: { parts: [] } }] }),
        ).toThrow();
    });
});

describe('isRetryableStatusCode', () => {
    it('503(高負荷による一時的な利用不可)はリトライ対象とする', () => {
        expect(isRetryableStatusCode(503)).toBe(true);
    });

    it('429(レート制限)はリトライ対象とする', () => {
        expect(isRetryableStatusCode(429)).toBe(true);
    });

    it('200・400・404等はリトライ対象としない(リクエスト自体の問題のため)', () => {
        expect(isRetryableStatusCode(200)).toBe(false);
        expect(isRetryableStatusCode(400)).toBe(false);
        expect(isRetryableStatusCode(404)).toBe(false);
    });
});
