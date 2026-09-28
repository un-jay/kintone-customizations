// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : desktop.jsのイベント登録テスト(desktop.events.test.js)
//     Description : モバイル専用のイベントが登録され、ボタン設置・オーバーレイ表示・
//                   保存成功時の早期リターンが期待通りに動くことを検証する。
//                   写真の実際の読み込み(Image/canvasのデコード)はjsdomでは
//                   検証できないため、「計算処理」の純粋関数はdesktop.test.jsで
//                   別途検証している。
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
    it('モバイル用の表示/保存成功イベントが登録される(PC用は登録しない)', () => {
        [
            'mobile.app.record.create.show',
            'mobile.app.record.edit.show',
            'mobile.app.record.create.submit.success',
            'mobile.app.record.edit.submit.success',
        ].forEach((name) => expect(handlers[name]).toBeTypeOf('function'));

        ['app.record.create.show', 'app.record.edit.show'].forEach((name) =>
            expect(handlers[name]).toBeUndefined(),
        );
    });
});

describe('モバイル画面', () => {
    function setupMobileKintone() {
        const spaces = {};
        const notification = vi.fn();
        const apiMock = vi.fn();
        globalThis.kintone.mobile = {
            app: {
                record: {
                    getSpaceElement: (id) => {
                        spaces[id] = spaces[id] || document.createElement('div');
                        return spaces[id];
                    },
                    get: () => ({
                        record: { METER_READINGS: { value: [] } },
                    }),
                    set: vi.fn(),
                },
            },
            showNotification: notification,
        };
        globalThis.kintone.api = apiMock;
        globalThis.kintone.api.url = (path) => path;
        return { spaces, notification, apiMock };
    }

    it('スペース要素へボタンを設置し、押すとオーバーレイ(撮影・入力欄付き)を開く', () => {
        const { spaces } = setupMobileKintone();
        const event = { record: {} };

        const returned = handlers['mobile.app.record.create.show'](event);
        expect(returned).toBe(event);

        const button = spaces.space_meter_add.querySelector(
            '.meter-reader-trigger-button',
        );
        expect(button).not.toBeNull();

        button.click();
        const overlay = document.querySelector('.meter-reader-overlay');
        expect(overlay).not.toBeNull();
        expect(document.body.style.overflow).toBe('hidden');

        const inputs = overlay.querySelectorAll('input[type=file]');
        expect(inputs).toHaveLength(1);
        expect(inputs[0].getAttribute('capture')).toBe('environment');

        expect(overlay.querySelector('.meter-reader-select')).not.toBeNull();
        expect(overlay.querySelector('.meter-reader-textarea')).not.toBeNull();

        const buttonTexts = [...overlay.querySelectorAll('button')].map(
            (b) => b.textContent,
        );
        expect(buttonTexts).toContain('📷 写真を撮る／選ぶ');
        expect(buttonTexts).toContain('数値を読み取る');
    });

    it('同じ画面で2回showが発火してもボタンは重複しない', () => {
        const { spaces } = setupMobileKintone();
        handlers['mobile.app.record.edit.show']({});
        handlers['mobile.app.record.edit.show']({});
        expect(
            spaces.space_meter_add.querySelectorAll('.meter-reader-trigger-button'),
        ).toHaveLength(1);
    });

    it('要素IDのスペースが見つからない場合は警告のみでエラーにしない', () => {
        globalThis.kintone.mobile = {
            app: {
                record: {
                    getSpaceElement: () => null,
                    get: () => ({ record: {} }),
                    set: vi.fn(),
                },
            },
            showNotification: vi.fn(),
        };
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(() => handlers['mobile.app.record.create.show']({})).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('キャンセルでオーバーレイを閉じ、背面のスクロール固定を戻す', () => {
        const { spaces } = setupMobileKintone();
        document.body.style.overflow = 'auto';
        handlers['mobile.app.record.create.show']({});
        spaces.space_meter_add.querySelector('button').click();
        const cancel = [
            ...document.querySelectorAll('.meter-reader-overlay button'),
        ].find((b) => b.textContent === 'キャンセル');
        cancel.click();
        expect(document.querySelector('.meter-reader-overlay')).toBeNull();
        expect(document.body.style.overflow).toBe('auto');
    });

    it('保留中の添付ファイルが無い場合、保存成功時は何もしない(通知・API呼び出しなし)', async () => {
        const { notification, apiMock } = setupMobileKintone();
        const event = {
            appId: 1,
            recordId: 2,
            record: { METER_READINGS: { value: [] }, $revision: { value: '1' } },
        };
        const returned = await handlers['mobile.app.record.create.submit.success'](event);
        expect(returned).toBe(event);
        expect(notification).not.toHaveBeenCalled();
        expect(apiMock).not.toHaveBeenCalled();
    });
});
