// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/01        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/13        J.Yamamoto      :isValidEmailのテストと、
//                                                extractRecipientsByTypeが不正な
//                                                メールアドレス形式でエラーになることの
//                                                テストを追加
// ----------------------------------------------------------------------
//     ModuleName  : Mailer.jsのユニットテスト(Mailer.test.js)
//     Description : renderTemplate/extractRecipientsByType/isValidEmail
//                   (いずれも副作用を持たない純粋関数)を検証する。
// ======================================================================

import { describe, expect, it } from 'vitest';
import Mailer from '../src/Mailer.js';

const { renderTemplate, extractRecipientsByType, isValidEmail } = Mailer;

describe('renderTemplate', () => {
    it('{{フィールドコード}}をレコードの値へ置換する', () => {
        const record = {
            TITLE: { value: '定例会議' },
            DEADLINE: { value: '2026-09-10' },
        };
        expect(renderTemplate('件名: {{TITLE}}(納期: {{DEADLINE}})', record)).toBe(
            '件名: 定例会議(納期: 2026-09-10)',
        );
    });

    it('レコードに存在しないフィールドコードはプレースホルダのまま残す', () => {
        const record = { TITLE: { value: '定例会議' } };
        expect(renderTemplate('{{TITLE}} / {{UNKNOWN_FIELD}}', record)).toBe(
            '定例会議 / {{UNKNOWN_FIELD}}',
        );
    });

    it('値がnull/undefinedのフィールドはプレースホルダのまま残す', () => {
        const record = { TITLE: { value: null } };
        expect(renderTemplate('{{TITLE}}', record)).toBe('{{TITLE}}');
    });
});

describe('extractRecipientsByType', () => {
    const config = {
        fields: {
            RECIPIENTS: 'RECIPIENTS',
            RECIPIENT_EMAIL: 'RECIPIENT_EMAIL',
            RECIPIENT_TYPE: 'RECIPIENT_TYPE',
        },
    };

    it('送信区分ごとにTO/CC/BCCへ振り分ける', () => {
        const record = {
            RECIPIENTS: {
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
            RECIPIENTS: {
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
        const record = { RECIPIENTS: { value: [row('', 'TO')] } };
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

    it('メールアドレスの形式が不正な行があればエラーにする(黙って無視しない)', () => {
        const record = {
            RECIPIENTS: { value: [row('invalid-email', 'TO')] },
        };
        expect(() => extractRecipientsByType(config, record)).toThrow(/invalid-email/);
    });

    function row(email, type) {
        return {
            value: {
                RECIPIENT_EMAIL: { value: email },
                RECIPIENT_TYPE: { value: type },
            },
        };
    }
});

describe('isValidEmail', () => {
    it('正しい形式のメールアドレスはtrueを返す', () => {
        expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('@が無い・ドメイン部にドットが無いなど不正な形式はfalseを返す', () => {
        expect(isValidEmail('invalid-email')).toBe(false);
        expect(isValidEmail('user@example')).toBe(false);
        expect(isValidEmail('@example.com')).toBe(false);
    });
});
