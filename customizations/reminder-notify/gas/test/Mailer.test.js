// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : Mailer.jsのユニットテスト(Mailer.test.js)
//     Description : renderTemplate/extractRecipientsByType
//                   (いずれも副作用を持たない純粋関数)を検証する。
// ======================================================================

import { describe, expect, it } from 'vitest';
import Mailer from '../src/Mailer.js';

const { renderTemplate, extractRecipientsByType } = Mailer;

describe('renderTemplate', () => {
    it('{{フィールドコード}}をレコードの値へ置換する', () => {
        const record = {
            Title: { value: '定例会議' },
            Deadline: { value: '2026-09-10' },
        };
        expect(renderTemplate('件名: {{Title}}(納期: {{Deadline}})', record)).toBe(
            '件名: 定例会議(納期: 2026-09-10)',
        );
    });

    it('レコードに存在しないフィールドコードはプレースホルダのまま残す', () => {
        const record = { Title: { value: '定例会議' } };
        expect(renderTemplate('{{Title}} / {{UnknownField}}', record)).toBe(
            '定例会議 / {{UnknownField}}',
        );
    });

    it('値がnull/undefinedのフィールドはプレースホルダのまま残す', () => {
        const record = { Title: { value: null } };
        expect(renderTemplate('{{Title}}', record)).toBe('{{Title}}');
    });
});

describe('extractRecipientsByType', () => {
    const config = {
        fields: {
            RECIPIENTS: 'Recipients',
            RECIPIENT_EMAIL: 'RecipientEmail',
            RECIPIENT_TYPE: 'RecipientType',
        },
    };

    it('送信区分ごとにTO/CC/BCCへ振り分ける', () => {
        const record = {
            Recipients: {
                value: [
                    row('to@example.com', 'TO'),
                    row('cc@example.com', 'CC'),
                    row('bcc@example.com', 'BCC'),
                ],
            },
        };
        expect(extractRecipientsByType(config, record)).toEqual({
            to: ['to@example.com'],
            cc: ['cc@example.com'],
            bcc: ['bcc@example.com'],
        });
    });

    it('送信区分が未設定・不明な値の行はTO扱いにする', () => {
        const record = {
            Recipients: {
                value: [
                    row('unspecified@example.com', ''),
                    row('unknown@example.com', 'XX'),
                ],
            },
        };
        expect(extractRecipientsByType(config, record)).toEqual({
            to: ['unspecified@example.com', 'unknown@example.com'],
            cc: [],
            bcc: [],
        });
    });

    it('メールアドレスが未入力の行は除外する', () => {
        const record = { Recipients: { value: [row('', 'TO')] } };
        expect(extractRecipientsByType(config, record)).toEqual({
            to: [],
            cc: [],
            bcc: [],
        });
    });

    it('送信先テーブルが未定義の場合は全区分とも空配列を返す', () => {
        expect(extractRecipientsByType(config, {})).toEqual({
            to: [],
            cc: [],
            bcc: [],
        });
    });

    function row(email, type) {
        return {
            value: {
                RecipientEmail: { value: email },
                RecipientType: { value: type },
            },
        };
    }
});
