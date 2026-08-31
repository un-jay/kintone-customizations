// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :複数フィールドへの分割書き込みに対応
//  V1.2.0     2026/08/18        J.Yamamoto      :複数バーコード規格・カメラ前面/背面選択に対応
// ----------------------------------------------------------------------
//     ModuleName  : 設定画面処理(config.js)
//     Description : プラグイン設定の読み込み・保存を行う。
//                   innerHTMLは使用せず、document.createElementでDOM要素を組み立てる。
// ======================================================================

((PLUGIN_ID) => {
    'use strict';

    const CONST = window.CodeReaderPlugin;
    const KEYS = CONST.CONFIG_KEYS;
    const DEFAULTS = CONST.CONFIG_DEFAULTS;
    const SPLIT_MODE = CONST.SPLIT_MODE;
    const CUSTOM_DELIMITER_VALUE = '';

    const enableQrCheckbox = document.getElementById('enable-qr');
    const enableBarcodeCheckbox = document.getElementById('enable-barcode');
    const barcodeFormatsRow = document.getElementById('barcode-formats-row');
    const barcodeFormatsContainer = document.getElementById('barcode-formats-container');
    const cameraFacingSelect = document.getElementById('camera-facing');
    const splitModeSelect = document.getElementById('split-mode');
    const delimiterRow = document.getElementById('delimiter-row');
    const delimiterPresetSelect = document.getElementById('delimiter-preset');
    const delimiterCustomOuter = document.getElementById('delimiter-custom-outer');
    const delimiterCustomInput = document.getElementById('delimiter-custom');
    const lengthColumnHeader = document.getElementById('length-column-header');
    const targetFieldsTbody = document.getElementById('target-fields-tbody');
    const addFieldButton = document.getElementById('add-field-button');
    const errorMessageElm = document.getElementById('error-message');
    const saveButton = document.getElementById('save-button');
    const cancelButton = document.getElementById('cancel-button');

    /** 画面上の対象フィールド行(フィールドコード入力・桁数入力のペア)を保持する */
    let fieldRows = [];
    /** バーコード規格チェックボックスの{value, input}一覧 */
    const barcodeFormatCheckboxes = [];

    /** 区切り文字プリセットの<option>を生成する */
    function renderDelimiterPresetOptions() {
        CONST.DELIMITER_PRESETS.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            delimiterPresetSelect.appendChild(option);
        });
    }

    /** カメラの向きの<option>を生成する */
    function renderCameraFacingOptions() {
        CONST.CAMERA_FACING_OPTIONS.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            cameraFacingSelect.appendChild(option);
        });
    }

    /** バーコード規格のチェックボックス一覧を生成する */
    function renderBarcodeFormatCheckboxes() {
        CONST.BARCODE_FORMATS.forEach(({ value, label }) => {
            const labelElm = document.createElement('label');
            labelElm.className = 'code-reader-checkbox-label';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = value;

            labelElm.appendChild(input);
            labelElm.appendChild(document.createTextNode(label));
            barcodeFormatsContainer.appendChild(labelElm);

            barcodeFormatCheckboxes.push({ value, input });
        });
    }

    /**
     * 対象フィールドの1行分(フィールドコード入力・桁数入力・削除ボタン)を生成する。
     * @param {{fieldCode: string, length: number|null}} field
     * @returns {HTMLTableRowElement}
     */
    function buildFieldRow(field) {
        const tr = document.createElement('tr');

        const codeTd = document.createElement('td');
        const codeOuter = document.createElement('div');
        codeOuter.className = 'kintoneplugin-input-outer';
        const codeInput = document.createElement('input');
        codeInput.type = 'text';
        codeInput.className = 'kintoneplugin-input-text';
        codeInput.placeholder = 'フィールドコード';
        codeInput.value = field.fieldCode || '';
        codeOuter.appendChild(codeInput);
        codeTd.appendChild(codeOuter);

        const lengthTd = document.createElement('td');
        const lengthOuter = document.createElement('div');
        lengthOuter.className = 'kintoneplugin-input-outer';
        const lengthInput = document.createElement('input');
        lengthInput.type = 'number';
        lengthInput.min = '0';
        lengthInput.className = 'kintoneplugin-input-text code-reader-length-input';
        lengthInput.placeholder = '桁数';
        lengthInput.value = field.length ? String(field.length) : '';
        lengthOuter.appendChild(lengthInput);
        lengthTd.appendChild(lengthOuter);

        const opTd = document.createElement('td');
        opTd.className = 'kintoneplugin-table-td-operation';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'kintoneplugin-button-remove-row-image';
        removeButton.title = '削除';
        removeButton.addEventListener('click', () => {
            fieldRows = fieldRows.filter((row) => row.tr !== tr);
            tr.remove();
        });
        opTd.appendChild(removeButton);

        tr.append(codeTd, lengthTd, opTd);

        fieldRows.push({ tr, codeInput, lengthInput });
        return tr;
    }

    /** 対象フィールドの行を1行追加する */
    function addFieldRow(field = { fieldCode: '', length: null }) {
        targetFieldsTbody.appendChild(buildFieldRow(field));
    }

    /** 有効なコード種別・分割方法に応じて、各設定項目の表示/非表示を切り替える */
    function updateVisibility() {
        barcodeFormatsRow.classList.toggle('hidden', !enableBarcodeCheckbox.checked);

        const mode = splitModeSelect.value;
        delimiterRow.classList.toggle('hidden', mode !== SPLIT_MODE.DELIMITER);
        lengthColumnHeader.classList.toggle('hidden', mode !== SPLIT_MODE.FIXED_LENGTH);
        document
            .querySelectorAll('.code-reader-length-input')
            .forEach((input) =>
                input
                    .closest('td')
                    .classList.toggle('hidden', mode !== SPLIT_MODE.FIXED_LENGTH),
            );

        const isCustomDelimiter = delimiterPresetSelect.value === CUSTOM_DELIMITER_VALUE;
        delimiterCustomOuter.classList.toggle('hidden', !isCustomDelimiter);
    }

    /** 保存済み設定を画面へ反映する */
    function loadConfig() {
        const config = kintone.plugin.app.getConfig(PLUGIN_ID);

        enableQrCheckbox.checked =
            (config[KEYS.ENABLE_QR] || DEFAULTS.ENABLE_QR) === 'true';
        enableBarcodeCheckbox.checked =
            (config[KEYS.ENABLE_BARCODE] || DEFAULTS.ENABLE_BARCODE) === 'true';

        const savedFormats = CONST.parseBarcodeFormats(config[KEYS.BARCODE_FORMATS]);
        const enabledFormats = savedFormats.length
            ? savedFormats
            : CONST.BARCODE.DEFAULT_FORMATS;
        barcodeFormatCheckboxes.forEach(({ value, input }) => {
            input.checked = enabledFormats.includes(value);
        });

        cameraFacingSelect.value =
            config[KEYS.CAMERA_FACING] || CONST.CAMERA.DEFAULT_FACING_MODE;

        const savedMode = config[KEYS.SPLIT_MODE] || SPLIT_MODE.NONE;
        splitModeSelect.value = savedMode;

        const savedDelimiter = config[KEYS.DELIMITER] || '';
        const presetValues = CONST.DELIMITER_PRESETS.map((preset) => preset.value);
        if (
            presetValues.includes(savedDelimiter) &&
            savedDelimiter !== CUSTOM_DELIMITER_VALUE
        ) {
            delimiterPresetSelect.value = savedDelimiter;
        } else {
            delimiterPresetSelect.value = CUSTOM_DELIMITER_VALUE;
            delimiterCustomInput.value = savedDelimiter;
        }

        const targetFields = CONST.parseTargetFields(config[KEYS.TARGET_FIELDS]);
        if (targetFields.length === 0) {
            addFieldRow();
        } else {
            targetFields.forEach((field) => addFieldRow(field));
        }

        updateVisibility();
    }

    /** 画面の入力値から、対象フィールド配列を組み立てる(空のフィールドコード行は除外) */
    function collectTargetFields() {
        return fieldRows
            .map(({ codeInput, lengthInput }) => ({
                fieldCode: codeInput.value.trim(),
                length: lengthInput.value ? Number(lengthInput.value) : null,
            }))
            .filter((field) => field.fieldCode);
    }

    /** チェック済みのバーコード規格の配列を取得する */
    function collectBarcodeFormats() {
        return barcodeFormatCheckboxes
            .filter(({ input }) => input.checked)
            .map(({ value }) => value);
    }

    /**
     * 選択中の区切り文字を解決する(プリセット、またはカスタム入力値)。
     * @returns {string}
     */
    function resolveDelimiter() {
        if (delimiterPresetSelect.value === CUSTOM_DELIMITER_VALUE) {
            return delimiterCustomInput.value;
        }
        return delimiterPresetSelect.value;
    }

    /**
     * 入力値を検証する。
     * @returns {string} エラーメッセージ(問題なければ空文字)
     */
    function validate(targetFields, barcodeFormats) {
        if (!enableQrCheckbox.checked && !enableBarcodeCheckbox.checked) {
            return 'QRコード・バーコードのいずれか一方以上を有効にしてください。';
        }
        if (enableBarcodeCheckbox.checked && barcodeFormats.length === 0) {
            return '対応するバーコード規格を1つ以上選択してください。';
        }
        if (targetFields.length === 0) {
            return '書き込み先フィールドを1つ以上指定してください。';
        }

        const mode = splitModeSelect.value;
        if (mode === SPLIT_MODE.NONE && targetFields.length > 1) {
            return '「分割しない」を選んだ場合、書き込み先フィールドは1つのみ指定してください。';
        }
        if (mode === SPLIT_MODE.DELIMITER && !resolveDelimiter()) {
            return '区切り文字を指定してください。';
        }
        return '';
    }

    function handleSave() {
        const targetFields = collectTargetFields();
        const barcodeFormats = collectBarcodeFormats();
        const errorMessage = validate(targetFields, barcodeFormats);
        if (errorMessage) {
            errorMessageElm.textContent = errorMessage;
            return;
        }
        errorMessageElm.textContent = '';

        const config = {
            [KEYS.ENABLE_QR]: String(enableQrCheckbox.checked),
            [KEYS.ENABLE_BARCODE]: String(enableBarcodeCheckbox.checked),
            [KEYS.BARCODE_FORMATS]: barcodeFormats.join(','),
            [KEYS.CAMERA_FACING]: cameraFacingSelect.value,
            [KEYS.SPLIT_MODE]: splitModeSelect.value,
            [KEYS.DELIMITER]: resolveDelimiter(),
            [KEYS.TARGET_FIELDS]: JSON.stringify(targetFields),
        };

        // successCallbackを省略すると、保存完了後にkintoneが自動でプラグイン一覧画面へ
        // 遷移し、完了メッセージを表示する。
        kintone.plugin.app.setConfig(config);
    }

    function handleCancel() {
        history.back();
    }

    renderDelimiterPresetOptions();
    renderCameraFacingOptions();
    renderBarcodeFormatCheckboxes();
    loadConfig();

    addFieldButton.addEventListener('click', () => {
        addFieldRow();
        updateVisibility();
    });
    enableBarcodeCheckbox.addEventListener('change', updateVisibility);
    splitModeSelect.addEventListener('change', updateVisibility);
    delimiterPresetSelect.addEventListener('change', updateVisibility);
    saveButton.addEventListener('click', handleSave);
    cancelButton.addEventListener('click', handleCancel);
})(kintone.$PLUGIN_ID);
