// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : AzureOcrClient.jsのユニットテスト(AzureOcrClient.test.js)
//     Description : extractTextFromReadResult(副作用を持たない純粋関数)を検証する。
//                   レスポンスの構造は公式リファレンスのサンプルレスポンスに準拠する。
//                   https://learn.microsoft.com/azure/ai-services/computer-vision/how-to/call-analyze-image-40
// ======================================================================

import { describe, expect, it } from 'vitest';
import AzureOcrClient from '../src/AzureOcrClient.js';

const { extractTextFromReadResult } = AzureOcrClient;

describe('extractTextFromReadResult', () => {
    it('複数行のreadResultから、行のテキストを上から順にLF区切りでつなげる', () => {
        const response = {
            readResult: {
                blocks: [
                    {
                        lines: [
                            { text: '午前:部品Aの組立完了' },
                            { text: '午後:検品予定' },
                        ],
                    },
                ],
            },
        };
        expect(extractTextFromReadResult(response)).toBe(
            '午前:部品Aの組立完了\n午後:検品予定',
        );
    });

    it('複数のblocksにまたがる場合も、すべての行をつなげる', () => {
        const response = {
            readResult: {
                blocks: [
                    { lines: [{ text: '1行目' }] },
                    { lines: [{ text: '2行目' }, { text: '3行目' }] },
                ],
            },
        };
        expect(extractTextFromReadResult(response)).toBe('1行目\n2行目\n3行目');
    });

    it('textが空の行は除外する', () => {
        const response = {
            readResult: {
                blocks: [{ lines: [{ text: '有効な行' }, { text: '' }] }],
            },
        };
        expect(extractTextFromReadResult(response)).toBe('有効な行');
    });

    it('blocksが無い・空の場合は空文字を返す', () => {
        expect(extractTextFromReadResult({ readResult: { blocks: [] } })).toBe('');
        expect(extractTextFromReadResult({ readResult: {} })).toBe('');
        expect(extractTextFromReadResult({})).toBe('');
    });
});
