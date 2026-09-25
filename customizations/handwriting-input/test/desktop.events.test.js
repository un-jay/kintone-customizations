// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/25        J.Yamamoto      :新規作成
//  V1.0.1     2026/09/25        J.Yamamoto      :写真ボタンを1つに戻したことに合わせて修正
// ----------------------------------------------------------------------
//     ModuleName  : desktop.jsのイベント登録テスト(desktop.events.test.js)
//     Description : PC用・モバイル用のイベントがそれぞれ登録され、
//                   モバイル画面でkintone.mobile.*のAPIが使われることを検証する。
// ======================================================================

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const handlers = {};

beforeAll(async () => {
    globalThis.kintone = {
        events: {
            on: (names, handler) => {
                [].concat(names).forEach((name) => {
                    handlers[name] = handler;
                });
            },
        },
    };
    await import('../src/desktop.js');
});

afterEach(() => {
    document.body.replaceChildren();
    document.body.style.overflow = '';
});

describe('イベント登録', () => {
    it('PC用・モバイル用の表示/保存成功イベントがすべて登録される', () => {
        [
            'app.record.create.show',
            'app.record.edit.show',
            'mobile.app.record.create.show',
            'mobile.app.record.edit.show',
            'app.record.create.submit.success',
            'app.record.edit.submit.success',
            'mobile.app.record.create.submit.success',
            'mobile.app.record.edit.submit.success',
        ].forEach((name) => expect(handlers[name]).toBeTypeOf('function'));
    });
});

describe('モバイル画面', () => {
    function setupMobileKintone() {
        const spaces = {};
        const notification = vi.fn();
        globalThis.kintone.mobile = {
            app: {
                record: {
                    getSpaceElement: (id) => {
                        spaces[id] = spaces[id] || document.createElement('div');
                        return spaces[id];
                    },
                },
            },
            showNotification: notification,
        };
        return { spaces, notification };
    }

    it('スペース要素へボタンを設置し、押すとオーバーレイ(写真を撮る／選ぶボタン付き)を開く', () => {
        const { spaces } = setupMobileKintone();
        const event = { record: {} };

        const returned = handlers['mobile.app.record.create.show'](event);
        expect(returned).toBe(event);

        const button = spaces.space_work_notes.querySelector(
            '.handwriting-input-trigger-button',
        );
        expect(button).not.toBeNull();
        expect(spaces.space_remarks.querySelector('button')).not.toBeNull();

        button.click();
        const overlay = document.querySelector('.handwriting-input-overlay');
        expect(overlay).not.toBeNull();
        expect(document.body.style.overflow).toBe('hidden');

        const inputs = overlay.querySelectorAll('input[type=file]');
        expect(inputs).toHaveLength(1);
        expect(inputs[0].getAttribute('capture')).toBe('environment');

        const buttonTexts = [...overlay.querySelectorAll('button')].map(
            (b) => b.textContent,
        );
        expect(buttonTexts).toContain('📷 写真を撮る／選ぶ');
    });

    it('同じ画面で2回showが発火してもボタンは重複しない', () => {
        const { spaces } = setupMobileKintone();
        handlers['mobile.app.record.edit.show']({});
        handlers['mobile.app.record.edit.show']({});
        expect(
            spaces.space_work_notes.querySelectorAll('.handwriting-input-trigger-button'),
        ).toHaveLength(1);
    });

    it('キャンセルでオーバーレイを閉じ、背面のスクロール固定を戻す', () => {
        const { spaces } = setupMobileKintone();
        document.body.style.overflow = 'auto';
        handlers['mobile.app.record.create.show']({});
        spaces.space_work_notes.querySelector('button').click();
        const cancel = [
            ...document.querySelectorAll('.handwriting-input-overlay button'),
        ].find((b) => b.textContent === 'キャンセル');
        cancel.click();
        expect(document.querySelector('.handwriting-input-overlay')).toBeNull();
        expect(document.body.style.overflow).toBe('auto');
    });

    it('写真未選択のまま保存成功しても何もしない(通知・API呼び出しなし)', async () => {
        const { notification } = setupMobileKintone();
        const event = { appId: 1, recordId: 2, record: { $revision: { value: '1' } } };
        const returned = await handlers['mobile.app.record.create.submit.success'](event);
        expect(returned).toBe(event);
        expect(notification).not.toHaveBeenCalled();
    });
});
