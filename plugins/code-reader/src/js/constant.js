// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :複数フィールドへの分割書き込みに対応
//  V1.2.0     2026/08/18        J.Yamamoto      :複数バーコード規格・カメラ前面/背面選択に対応
// ----------------------------------------------------------------------
//     ModuleName  : 定数定義(constant.js)
//     Description : プラグイン全体で共有する定数・名前空間の定義
// ======================================================================

((global) => {
    'use strict';

    /**
     * プラグイン共通の名前空間。
     * ファイル間で共有する定数・関数はすべてこの配下に定義し、
     * 生のグローバル変数を作らない。
     */
    const CodeReaderPlugin = {
        /** kintone.plugin.app.getConfig/setConfig で保存する設定キー */
        CONFIG_KEYS: {
            ENABLE_QR: 'enableQr',
            ENABLE_BARCODE: 'enableBarcode',
            /** カンマ区切り文字列として保存する: Quagga2のリーダー種別名の配列 */
            BARCODE_FORMATS: 'barcodeFormatsCsv',
            CAMERA_FACING: 'cameraFacing',
            SPLIT_MODE: 'splitMode',
            DELIMITER: 'delimiter',
            /** JSON文字列として保存する: [{ fieldCode: string, length: number|null }] */
            TARGET_FIELDS: 'targetFieldsJson',
        },

        /** 設定値の既定値 */
        CONFIG_DEFAULTS: {
            ENABLE_QR: 'true',
            ENABLE_BARCODE: 'true',
        },

        /** 読み取り結果の分割方法 */
        SPLIT_MODE: {
            /** 分割しない(1フィールドへそのまま書き込む) */
            NONE: 'none',
            /** 区切り文字で分割する */
            DELIMITER: 'delimiter',
            /** 桁数(文字数)で分割する */
            FIXED_LENGTH: 'fixedLength',
        },

        /** 区切り文字プリセット。valueが空文字のものは「カスタム(自由入力)」を表す */
        DELIMITER_PRESETS: [
            { value: ',', label: 'カンマ ( , )' },
            { value: ';', label: 'セミコロン ( ; )' },
            { value: ':', label: 'コロン ( : )' },
            { value: '-', label: 'ハイフン ( - )' },
            { value: '_', label: 'アンダースコア ( _ )' },
            { value: '/', label: 'スラッシュ ( / )' },
            { value: '|', label: 'パイプ ( | )' },
            { value: '\t', label: 'タブ' },
            { value: ' ', label: 'スペース' },
            { value: '', label: 'カスタム(自由入力)' },
        ],

        /** カメラの向き選択肢 */
        CAMERA_FACING_OPTIONS: [
            { value: 'environment', label: '背面カメラ優先' },
            { value: 'user', label: '前面カメラ優先' },
        ],

        /** UIに表示するテキスト */
        UI: {
            SCAN_QR_BUTTON: 'QRコードをスキャン',
            SCAN_BARCODE_BUTTON: 'バーコードをスキャン',
            CAMERA_TITLE_QR: 'QRコードを読み取ってください',
            CAMERA_TITLE_BARCODE: 'バーコードを読み取ってください',
            CONFIRM_TITLE: '読み取り結果',
            CONFIRM_OK: 'OK',
            CONFIRM_CANCEL: '再取得',
        },

        /** エラー・警告メッセージ */
        MSGS: {
            START_CAMERA_ERROR: '[ERROR] カメラ起動に失敗しました。',
            CAMERA_SUPPORT_ERROR: '[ERROR] カメラAPIがサポートされていません。',
            GET_IMAGE_WARN: '[WARN] getImageData失敗。',
            NOT_JSQR_WARN:
                '[WARN] jsQRが読み込まれていません。QRコードの読み取りはできません。',
            NOT_QUAGGA_WARN:
                '[WARN] Quagga2が読み込まれていません。バーコードの読み取りはできません。',
            QUAGGA_INIT_WARN: '[WARN] Quagga2初期化失敗:',
            TARGET_FIELD_MISSING: (fieldCode) =>
                `[ERROR] フィールドコード「${fieldCode}」がこのアプリに存在しません。プラグイン設定を確認してください。`,
        },

        /** kintone dialogのbeforeClose action値 */
        CONFIRM_RESULT: {
            OK: 'OK',
        },

        /** カメラ設定値 */
        CAMERA: {
            /** cameraFacing未設定時の既定値 */
            DEFAULT_FACING_MODE: 'environment',
        },

        /** CSSクラス名 */
        CLASS_NAMES: {
            APP_BTN: 'code-reader-app-btn',
            VIDEO: 'code-reader-video-frame',
        },

        /**
         * 対応バーコード規格(Quagga2のリーダー種別)。
         * https://github.com/ericblade/quagga2 で対応している主要な規格。
         */
        BARCODE_FORMATS: [
            { value: 'code_39_reader', label: 'CODE39' },
            { value: 'code_128_reader', label: 'CODE128' },
            { value: 'ean_reader', label: 'EAN-13' },
            { value: 'ean_8_reader', label: 'EAN-8' },
            { value: 'upc_reader', label: 'UPC-A' },
            { value: 'upc_e_reader', label: 'UPC-E' },
            { value: 'codabar_reader', label: 'Codabar (NW-7)' },
            { value: 'i2of5_reader', label: 'ITF (Interleaved 2 of 5)' },
            { value: 'code_93_reader', label: 'CODE93' },
        ],

        /** バーコード読み取り設定値 */
        BARCODE: {
            /** barcodeFormatsCsv未設定時の既定値(従来の挙動を維持) */
            DEFAULT_FORMATS: ['code_39_reader'],
            DETECTION_COUNT: 3,
            PATCH_SIZE: 'medium',
            HALF_SAMPLE: true,
            FREQUENCY: 10,
        },
    };

    global.CodeReaderPlugin = CodeReaderPlugin;
})(window);
