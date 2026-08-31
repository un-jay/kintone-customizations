// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/19        J.Yamamoto      :桁数(文字数)による複数フィールド分割に対応
//                                                (code-readerプラグインのsplitScannedValueを再利用)
//  V1.2.0     2026/08/19        J.Yamamoto      :code-readerプラグインの読み込みタイミングに
//                                                依存してファイル全体が例外で止まっていた不具合を修正
//                                                (CONFIGでのCodeReaderPlugin参照を文字列直書きに変更、
//                                                 プラグイン未読み込み時はエラー通知して処理を打ち切る)
//  V1.3.0     2026/08/19        J.Yamamoto      :window.CodeReaderPluginをファイル読み込み時に
//                                                1度だけ変数へキャプチャしていたため、その後プラグイン
//                                                が読み込まれても常にundefinedのままになる不具合を修正
//                                                (kintoneはJS/CSSカスタマイズをプラグインより先に読み込む
//                                                 ため、ファイル冒頭ではプラグインはまだ未読み込み。
//                                                 各イベントハンドラーの発火時点で都度読み直す形にした)
// ----------------------------------------------------------------------
//     ModuleName  : 着完打刻カスタマイズ(desktop.js)
//     Description : code-readerプラグインを利用したカスタマイズの実装例。
//                   - 一覧画面のヘッダーに「着手」「完了」ボタンを表示
//                   - QRコード/バーコードをスキャンして装置IDを読み取り
//                   - 着手: レコード追加画面に遷移し、装置IDと開始時刻を自動入力
//                   - 完了: 該当レコードの編集画面に遷移し、終了時刻を自動入力
//                   - 読み取った1つのコードは、CONFIG.SPLIT_MODEに従って
//                     複数のIDフィールドへ分割して書き込む(既定は桁数分割)
//     依存プラグイン: code-reader
//                     (CodeReaderPlugin.QRReader / BarcodeReader / splitScannedValue を使用。
//                      プラグイン自体の自動フィールド書き込み機能とは独立して動作するため、
//                      プラグイン設定画面の書き込み先フィールドコードは空のままにしてください)
// ======================================================================

(() => {
    'use strict';

    // 注意: kintoneはJS/CSSカスタマイズをプラグインより先に読み込むため、このファイルの
    // トップレベルの時点ではwindow.CodeReaderPluginはまだ定義されていない。
    // 各イベントハンドラーが実際に発火するタイミング(=全スクリプト読み込み後)で
    // window.CodeReaderPluginを都度読み直すこと。ここで変数にキャプチャして使い回さない。

    // ==========================
    // 設定値（アプリごとに変更する）
    // ==========================

    /**
     * kintoneフィールドコード・分割方法(このアプリのサンプル値。実アプリに合わせて変更してください)
     * SPLIT_MODEはCodeReaderPlugin.SPLIT_MODEの値と同じ文字列を直接指定する
     * (プラグインの読み込みタイミングに関わらず、このファイル自体は必ず最後まで読み込めるようにするため)。
     */
    const CONFIG = {
        /** 読み取ったコードの分割方法。'fixedLength'(桁数分割) または 'delimiter'(区切り文字分割) */
        SPLIT_MODE: 'fixedLength',
        /** SPLIT_MODE='delimiter'のときに使う区切り文字(fixedLengthのときは未使用) */
        DELIMITER: ',',
        /** 分割した値を書き込む順番のフィールドコードと、桁数(FIXED_LENGTHのときのみ使用) */
        ID_FIELDS: [
            { fieldCode: 'SEIBAN', length: 6 },
            { fieldCode: 'HINMOKU_ID', length: 1 },
            { fieldCode: 'BUMON_ID', length: 2 },
            { fieldCode: 'SAKUZU_ID', length: 1 },
            { fieldCode: 'SAKUZU_SUB_ID', length: 1 },
        ],
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
        CODE_VALUE: 'code_value', // 読み取った生のコード文字列(分割前)
    };

    const CURRENT_MODE = {
        START: 'start',
        END: 'end',
    };

    const MOBILE_IDENTIFIER = 'mobile';

    const PLUGIN_NOT_LOADED_ERROR =
        '[ERROR] code-readerプラグインが読み込まれていません。プラグインがアプリに追加され、有効になっているか確認してください。';

    // ==========================
    // ユーティリティ
    // ==========================

    /**
     * code-readerプラグインが読み込まれているかを確認する。
     * window.CodeReaderPluginは呼び出しのたびに読み直す(トップレベルでキャプチャしない)。
     * 読み込まれていない場合はコンソールにエラーを出力する(通知APIもプラグイン由来のため使えない)。
     * @returns {boolean}
     */
    function isPluginLoaded() {
        if (!window.CodeReaderPlugin) {
            console.error(PLUGIN_NOT_LOADED_ERROR);
            return false;
        }
        return true;
    }

    /**
     * 読み取ったコードを、CONFIG.SPLIT_MODEに従ってCONFIG.ID_FIELDSの数だけ分割する。
     * 分割ロジック自体はcode-readerプラグインのjs/calc.js(splitScannedValue)を再利用する。
     * @param {string} codeValue
     * @returns {string[]}
     */
    const splitScannedCode = (codeValue) =>
        window.CodeReaderPlugin.splitScannedValue(codeValue, {
            splitMode: CONFIG.SPLIT_MODE,
            delimiter: CONFIG.DELIMITER,
            targetFields: CONFIG.ID_FIELDS,
        });

    /**
     * レコードの全IDフィールドがvaluesと完全一致し、かつ未完了かどうかを判定する。
     * @param {Object}   record - kintoneレコード
     * @param {string[]} values - splitScannedCode()の戻り値
     * @returns {boolean}
     */
    const matchesAllIdsAndIncomplete = (record, values) => {
        const allMatch = values.every((value, i) => {
            const field = CONFIG.ID_FIELDS[i];
            return field && record[field.fieldCode]?.value === value;
        });
        return allMatch && !record[CONFIG.FIELD_END_AT].value;
    };

    // ==========================
    // レコード一覧画面処理
    // ==========================

    /**
     * 一覧画面: 「着手」「完了」ボタンを追加し、QR/バーコードスキャンを実装する。
     * リーダーはCodeReaderPlugin.QRReader / BarcodeReaderを差し替えて使用可能。
     */
    kintone.events.on(EVENTS.INDEX, (event) => {
        if (!isPluginLoaded()) {
            return event;
        }
        // ハンドラー発火時点(=全スクリプト読み込み後)で読み直した、最新の参照。
        const CodeReaderPlugin = window.CodeReaderPlugin;

        const isMobile = event.type.includes(MOBILE_IDENTIFIER);

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
            const values = splitScannedCode(codeValue);

            let appId;
            if (isMobile) {
                appId = kintone.mobile.app.getId();
            } else {
                appId = kintone.app.getId();
            }

            if (currentMode === CURRENT_MODE.START) {
                const existingRecord = event.records.find((r) =>
                    matchesAllIdsAndIncomplete(r, values),
                );
                if (existingRecord) {
                    CodeReaderPlugin.CodeReaderBase.showNotification(
                        MSGS.ALREADY_STARTED + ` 装置ID[${codeValue}]`,
                        isMobile,
                    );
                    return;
                }
                sessionStorage.setItem(STORAGE_KEYS.CODE_VALUE, codeValue);
                const targetUrl = await kintone.buildPageUrl('APP_CREATE', { appId });
                window.location.href = targetUrl;
            } else if (currentMode === CURRENT_MODE.END) {
                const targetRecord = event.records.find((r) =>
                    matchesAllIdsAndIncomplete(r, values),
                );
                if (!targetRecord) {
                    CodeReaderPlugin.CodeReaderBase.showNotification(
                        MSGS.FIND_RECORD_ERROR,
                        isMobile,
                    );
                    return;
                }
                sessionStorage.setItem(STORAGE_KEYS.CODE_VALUE, codeValue);
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
     * 追加画面: sessionStorageのコードを分割し、各IDフィールドに設定して着手打刻する。
     */
    kintone.events.on(EVENTS.CREATE, (event) => {
        const record = event.record;
        const codeValue = sessionStorage.getItem(STORAGE_KEYS.CODE_VALUE);

        if (codeValue === null) {
            return event;
        }
        if (!isPluginLoaded()) {
            return event;
        }

        const values = splitScannedCode(codeValue);

        values.forEach((value, i) => {
            const field = CONFIG.ID_FIELDS[i];
            if (field && record[field.fieldCode]) {
                record[field.fieldCode].value = value;
                // ルックアップフィールドの場合、値と同時にlookup:trueを指定すると
                // 参照先アプリから自動取得される(ルックアップでなければ無視される)。
                record[field.fieldCode].lookup = true;
            }
        });

        record[CONFIG.FIELD_START_AT].value = new Date().toISOString();
        sessionStorage.removeItem(STORAGE_KEYS.CODE_VALUE);

        return event;
    });

    // ==========================
    // レコード編集画面処理
    // ==========================

    /**
     * 編集画面: sessionStorageのコードを分割し、レコードの全IDフィールドと一致すれば完了打刻する。
     */
    kintone.events.on(EVENTS.EDIT, (event) => {
        const record = event.record;
        const codeValue = sessionStorage.getItem(STORAGE_KEYS.CODE_VALUE);

        if (codeValue === null) {
            return event;
        }
        if (!isPluginLoaded()) {
            return event;
        }

        const values = splitScannedCode(codeValue);
        const allMatch = values.every((value, i) => {
            const field = CONFIG.ID_FIELDS[i];
            return field && record[field.fieldCode]?.value === value;
        });

        if (allMatch) {
            record[CONFIG.FIELD_END_AT].value = new Date().toISOString();
            sessionStorage.removeItem(STORAGE_KEYS.CODE_VALUE);
        }

        return event;
    });
})();
