// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : KintoneClient.jsのユニットテスト(KintoneClient.test.js)
//     Description : buildBaseUrl(副作用を持たない純粋関数)を検証する。
//                   KINTONE_SUBDOMAINに完全なドメインを誤って設定しても
//                   .cybozu.comが二重に付かないことを確認する回帰テスト。
// ======================================================================

import { describe, expect, it } from 'vitest';
import KintoneClient from '../src/KintoneClient.js';

const { buildBaseUrl, buildApiBase } = KintoneClient;

describe('buildApiBase', () => {
    it('ゲストスペースIDが無い場合は、通常のスペース用URL(/k/v1)を返す', () => {
        expect(buildApiBase({ subdomain: 'example', guestSpaceId: '' })).toBe(
            'https://example.cybozu.com/k/v1',
        );
        expect(buildApiBase({ subdomain: 'example' })).toBe(
            'https://example.cybozu.com/k/v1',
        );
    });

    it('ゲストスペースIDがある場合は、ゲストスペース用URL(/k/guest/ID/v1)を返す', () => {
        expect(buildApiBase({ subdomain: 'example', guestSpaceId: '12' })).toBe(
            'https://example.cybozu.com/k/guest/12/v1',
        );
    });
});

describe('buildBaseUrl', () => {
    it('サブドメイン名のみを指定した場合、kintoneのベースURLを組み立てる', () => {
        expect(buildBaseUrl({ subdomain: 'example' })).toBe('https://example.cybozu.com');
    });

    it('誤って完全なドメイン(.cybozu.com付き)を指定しても、二重に付与しない', () => {
        expect(buildBaseUrl({ subdomain: 'example.cybozu.com' })).toBe(
            'https://example.cybozu.com',
        );
    });

    it('完全なドメインの末尾にスラッシュが付いていても正しく補正する', () => {
        expect(buildBaseUrl({ subdomain: 'example.cybozu.com/' })).toBe(
            'https://example.cybozu.com',
        );
    });

    it('大文字小文字が混在していても.cybozu.comを正しく検出する', () => {
        expect(buildBaseUrl({ subdomain: 'example.CYBOZU.COM' })).toBe(
            'https://example.cybozu.com',
        );
    });
});
