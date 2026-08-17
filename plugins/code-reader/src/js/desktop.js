// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :複数フィールドへの分割書き込みに対応
// ----------------------------------------------------------------------
//     ModuleName  : メイン処理(desktop.js)
//     Description : レコード追加・編集画面にスキャンボタンを表示し、
//                   読み取ったコードをプラグイン設定で指定したフィールドへ書き込む。
//                   複数フィールドが設定されている場合は、区切り文字または桁数で分割して
//                   順番に書き込む。イベント制御のみを行い、DOM操作はjs/ui/配下の
//                   リーダークラスに委譲し、分割処理はjs/calc.jsに委譲する。
// ======================================================================

((PLUGIN_ID) => {
    'use strict';

    const CONST = window.CodeReaderPlugin;

    const EVENTS = [
        'app.record.create.show',
        'app.record.edit.show',
        'mobile.app.record.create.show',
        'mobile.app.record.edit.show',
    ];

    /**
     * プラグイン設定を読み込む。
     * @returns {{
     *   enableQr: boolean,
     *   enableBarcode: boolean,
     *   splitMode: string,
     *   delimiter: string,
     *   targetFields: Array<{fieldCode: string, length: number|null}>,
     * }}
     */
    function loadConfig() {
        const config = kintone.plugin.app.getConfig(PLUGIN_ID);
        const KEYS = CONST.CONFIG_KEYS;
        const DEFAULTS = CONST.CONFIG_DEFAULTS;

        return {
            enableQr: (config[KEYS.ENABLE_QR] || DEFAULTS.ENABLE_QR) === 'true',
            enableBarcode:
                (config[KEYS.ENABLE_BARCODE] || DEFAULTS.ENABLE_BARCODE) === 'true',
            splitMode: config[KEYS.SPLIT_MODE] || CONST.SPLIT_MODE.NONE,
            delimiter: config[KEYS.DELIMITER] || '',
            targetFields: CONST.parseTargetFields(config[KEYS.TARGET_FIELDS]),
        };
    }

    /**
     * 読み取り結果を分割し、対象フィールドへ順番に書き込む。
     * @param {string}  code
     * @param {Object}  config - loadConfig()の戻り値
     * @param {boolean} isMobile
     */
    function writeToFields(code, config, isMobile) {
        const record = isMobile
            ? kintone.mobile.app.record.get().record
            : kintone.app.record.get().record;

        const values = CONST.splitScannedValue(code, config);
        let hasChange = false;

        config.targetFields.forEach(({ fieldCode }, i) => {
            const value = values[i];
            if (value === undefined) {
                return;
            }
            if (!record[fieldCode]) {
                CONST.CodeReaderBase.showNotification(
                    CONST.MSGS.TARGET_FIELD_MISSING(fieldCode),
                    isMobile,
                );
                return;
            }
            record[fieldCode].value = value;
            hasChange = true;
        });

        if (!hasChange) {
            return;
        }

        if (isMobile) {
            kintone.mobile.app.record.set({ record });
        } else {
            kintone.app.record.set({ record });
        }
    }

    /**
     * 有効なコード種別ごとにスキャンボタンを生成し、headerElmへ追加する。
     * @param {HTMLElement} headerElm
     * @param {boolean}     isMobile
     * @param {Object}      config
     */
    function setupButtons(headerElm, isMobile, config) {
        headerElm
            .querySelectorAll(`.${CONST.CLASS_NAMES.APP_BTN}`)
            .forEach((elm) => elm.remove());

        const readers = [];
        if (config.enableQr) {
            readers.push({ ReaderClass: CONST.QRReader, label: CONST.UI.SCAN_QR_BUTTON });
        }
        if (config.enableBarcode) {
            readers.push({
                ReaderClass: CONST.BarcodeReader,
                label: CONST.UI.SCAN_BARCODE_BUTTON,
            });
        }

        readers.forEach(({ ReaderClass, label }) => {
            const reader = new ReaderClass({ headerElm, isMobile });
            const button = reader.createButton(label, CONST.CLASS_NAMES.APP_BTN);
            button.style.marginRight = '8px';

            reader.setOkHandler((code) => {
                writeToFields(code, config, isMobile);
            });

            button.addEventListener('click', () => reader.start());
            headerElm.appendChild(button);
        });
    }

    kintone.events.on(EVENTS, (event) => {
        const isMobile = event.type.includes('mobile');
        const config = loadConfig();

        if (config.targetFields.length === 0) {
            return event;
        }

        const headerElm = isMobile
            ? kintone.mobile.app.getHeaderSpaceElement()
            : kintone.app.record.getHeaderMenuSpaceElement();

        if (!headerElm) {
            return event;
        }

        setupButtons(headerElm, isMobile, config);

        return event;
    });
})(kintone.$PLUGIN_ID);
