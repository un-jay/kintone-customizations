// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : 着完打刻カスタマイズ(desktop.js)
//     Description : code-readerプラグインを利用したカスタマイズの実装例。
//                   - 一覧画面のヘッダーに「着手」「完了」ボタンを表示
//                   - QRコード/バーコードをスキャンして装置IDを読み取り
//                   - 着手: レコード追加画面に遷移し、装置IDと開始時刻を自動入力
//                   - 完了: 該当レコードの編集画面に遷移し、終了時刻を自動入力
//                   - 装置IDはカンマ区切りで複数指定可(各IDを別フィールドに設定)
//     依存プラグイン: code-reader
//                     (CodeReaderPlugin.QRReader / BarcodeReader を使用。
//                      プラグイン自体の自動フィールド書き込み機能とは独立して動作するため、
//                      プラグイン設定画面の書き込み先フィールドコードは空のままにしてください)
// ======================================================================

(() => {
    'use strict';

    // ==========================
    // 設定値（アプリごとに変更する）
    // ==========================

    /** kintoneフィールドコード(このアプリのサンプル値。実アプリに合わせて変更してください) */
    const CONFIG = {
        ID_FIELDS: ['SEIBAN'], // カンマ区切りIDに対応するフィールド(順番対応)
        FIELD_START_AT: 'TYAKUSYU_DT',
        FIELD_END_AT: 'KANRYO_DT',
    };

    // ==========================
    // 定義値（内部実装定数）
    // ==========================

    const EVENTS = {
        INDEX: ['app.record.index.show', 'mobile.app.record.index.show'],
        CREATE: ['app.record.create.show', 'mobile.app.record.create.show'],
        EDIT: ['app.record.edit.show', 'mobile.app.record.edit.show'],
    };

    const MSGS = {
        FIND_RECORD_ERROR: '[ERROR] 該当レコードが見つかりませんでした。',
        ALREADY_STARTED:
            '[ERROR] この装置IDは既に着手済みです。完了してから再度着手してください。',
    };

    const STORAGE_KEYS = {
        CODE_IDS: 'code_ids', // 読み取ったID群(カンマ区切り文字列)
    };

    const CURRENT_MODE = {
        START: 'start',
        END: 'end',
    };

    const MOBILE_IDENTIFIER = 'mobile';

    // ==========================
    // ユーティリティ
    // ==========================

    /**
     * スキャン結果文字列をID配列に変換する。
     * @param {string} codeValue - カンマ区切りID文字列
     * @returns {string[]}
     */
    const parseIds = (codeValue) =>
        codeValue
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

    /**
     * レコードの全IDフィールドがidsと完全一致し、かつ未完了かどうかを判定する。
     * @param {Object}   record - kintoneレコード
     * @param {string[]} ids    - ID配列
     * @returns {boolean}
     */
    const matchesAllIdsAndIncomplete = (record, ids) => {
        const allIdsMatch = ids.every((id, i) => {
            const fieldCode = CONFIG.ID_FIELDS[i];
            return fieldCode && record[fieldCode]?.value === id;
        });
        return allIdsMatch && !record[CONFIG.FIELD_END_AT].value;
    };

    // ==========================
    // レコード一覧画面処理
    // ==========================

    /**
     * 一覧画面: 「着手」「完了」ボタンを追加し、QR/バーコードスキャンを実装する。
     * リーダーはCodeReaderPlugin.QRReader / BarcodeReaderを差し替えて使用可能。
     */
    kintone.events.on(EVENTS.INDEX, (event) => {
        const isMobile = event.type.includes(MOBILE_IDENTIFIER);
        const CodeReaderPlugin = window.CodeReaderPlugin;

        let headerElm;
        if (isMobile) {
            headerElm = kintone.mobile.app.getHeaderSpaceElement();
        } else {
            headerElm = kintone.app.getHeaderMenuSpaceElement();
        }

        let currentMode = null;

        // CodeReaderPlugin.QRReader または CodeReaderPlugin.BarcodeReader を使用(差し替え可能)
        const reader = new CodeReaderPlugin.QRReader({ headerElm, isMobile });

        // 着手・完了ボタンの重複を除去してから追加(ページ再表示時の対策)
        headerElm
            .querySelectorAll(`.${CodeReaderPlugin.CLASS_NAMES.APP_BTN}`)
            .forEach((elm) => elm.remove());
        const startBtn = reader.createButton(
            '着手',
            CodeReaderPlugin.CLASS_NAMES.APP_BTN,
        );
        const endBtn = reader.createButton('完了', CodeReaderPlugin.CLASS_NAMES.APP_BTN);
        headerElm.appendChild(startBtn);
        headerElm.appendChild(endBtn);

        /**
         * OKボタン: 読み取り結果をsessionStorageに保存して画面遷移する。
         */
        reader.setOkHandler(async (codeValue) => {
            const ids = parseIds(codeValue);

            let appId;
            if (isMobile) {
                appId = kintone.mobile.app.getId();
            } else {
                appId = kintone.app.getId();
            }

            if (currentMode === CURRENT_MODE.START) {
                const existingRecord = event.records.find((r) =>
                    matchesAllIdsAndIncomplete(r, ids),
                );
                if (existingRecord) {
                    CodeReaderPlugin.CodeReaderBase.showNotification(
                        MSGS.ALREADY_STARTED + ` 装置ID[${codeValue}]`,
                        isMobile,
                    );
                    return;
                }
                sessionStorage.setItem(STORAGE_KEYS.CODE_IDS, codeValue);
                const targetUrl = await kintone.buildPageUrl('APP_CREATE', { appId });
                window.location.href = targetUrl;
            } else if (currentMode === CURRENT_MODE.END) {
                const targetRecord = event.records.find((r) =>
                    matchesAllIdsAndIncomplete(r, ids),
                );
                if (!targetRecord) {
                    CodeReaderPlugin.CodeReaderBase.showNotification(
                        MSGS.FIND_RECORD_ERROR,
                        isMobile,
                    );
                    return;
                }
                sessionStorage.setItem(STORAGE_KEYS.CODE_IDS, codeValue);
                const targetUrl = await kintone.buildPageUrl('APP_EDIT', {
                    appId,
                    recordId: targetRecord.$id.value,
                });
                window.location.href = targetUrl;
            }
        });

        startBtn.onclick = () => {
            currentMode = CURRENT_MODE.START;
            reader.start();
        };

        endBtn.onclick = () => {
            currentMode = CURRENT_MODE.END;
            reader.start();
        };

        return event;
    });

    // ==========================
    // レコード追加画面処理
    // ==========================

    /**
     * 追加画面: sessionStorageのIDを各IDフィールドに設定して着手打刻する。
     */
    kintone.events.on(EVENTS.CREATE, (event) => {
        const record = event.record;
        const codeValue = sessionStorage.getItem(STORAGE_KEYS.CODE_IDS);

        if (codeValue === null) {
            return event;
        }

        const ids = parseIds(codeValue);

        ids.forEach((id, i) => {
            const fieldCode = CONFIG.ID_FIELDS[i];
            if (fieldCode && record[fieldCode]) {
                record[fieldCode].value = id;
                record[fieldCode].lookup = true;
            }
        });

        record[CONFIG.FIELD_START_AT].value = new Date().toISOString();
        sessionStorage.removeItem(STORAGE_KEYS.CODE_IDS);

        return event;
    });

    // ==========================
    // レコード編集画面処理
    // ==========================

    /**
     * 編集画面: sessionStorageのIDがレコードの全IDフィールドと一致すれば完了打刻する。
     */
    kintone.events.on(EVENTS.EDIT, (event) => {
        const record = event.record;
        const codeValue = sessionStorage.getItem(STORAGE_KEYS.CODE_IDS);

        if (codeValue === null) {
            return event;
        }

        const ids = parseIds(codeValue);
        const allIdsMatch = ids.every((id, i) => {
            const fieldCode = CONFIG.ID_FIELDS[i];
            return fieldCode && record[fieldCode]?.value === id;
        });

        if (allIdsMatch) {
            record[CONFIG.FIELD_END_AT].value = new Date().toISOString();
            sessionStorage.removeItem(STORAGE_KEYS.CODE_IDS);
        }

        return event;
    });
})();
