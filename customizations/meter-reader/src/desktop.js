// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : メイン処理(desktop.js)
//     Description : アナログ針メーター・デジタル表示メーターを撮影し、GAS Web App
//                   経由でGemini API(マルチモーダルAI)により数値を読み取って、
//                   テーブル(サブテーブル)フィールドへ1行ずつ追加するカスタマイズ。
//                   モバイル専用(kintone.mobile.*のみを使用)。
//                   対象アプリはMETER_TARGETSに定義したテーブル・フィールドコード・
//                   スペース要素IDで作成されている前提。詳細はCLAUDE.mdを参照。
// ======================================================================

(() => {
    'use strict';

    // ==========================
    // 定数
    // ==========================

    /**
     * メーター読み取りの対象テーブルの組。1アプリに複数設定できる(通常は1つで足りる)。
     * tableField : 読み取り結果を1行ずつ追加するテーブル(サブテーブル)フィールド
     * fields     : テーブル内のサブフィールドのフィールドコード一式
     * spaceId    : ボタンを設置するスペースフィールドの要素ID(テーブルの直前に配置)
     * label      : ボタン・見出しに表示する名称
     */
    const METER_TARGETS = [
        {
            tableField: 'METER_READINGS',
            fields: {
                name: 'METER_NAME',
                type: 'METER_TYPE',
                value: 'METER_VALUE',
                unit: 'METER_UNIT',
                confidence: 'METER_CONFIDENCE',
                note: 'METER_NOTE',
                photo: 'METER_PHOTO',
            },
            spaceId: 'space_meter_add',
            label: 'メーター',
        },
    ];

    /** GAS Web AppのデプロイURL(デプロイ後、実際のURLに書き換えること。末尾は/exec) */
    const GAS_WEB_APP_URL =
        'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';

    /** GAS側のSHARED_SECRETスクリプトプロパティと同じ値に書き換えること */
    const GAS_SHARED_SECRET = 'REPLACE_WITH_SHARED_SECRET';

    /** クライアント側でリサイズする画像の長辺(px)。現場のネットワークが遅い前提で送信量を抑える */
    const RESIZE_MAX_DIMENSION = 1600;

    /** リサイズ後のJPEG品質(0〜1) */
    const RESIZE_JPEG_QUALITY = 0.8;

    const BUTTON_CLASS = 'meter-reader-trigger-button';

    /** kintoneのドロップダウンフィールドに設定する選択肢の文言(METER_TYPEフィールド) */
    const METER_TYPE_LABEL = {
        analog: 'アナログ',
        digital: 'デジタル',
    };

    /** kintoneのドロップダウンフィールドに設定する選択肢の文言(METER_CONFIDENCEフィールド) */
    const CONFIDENCE_LABEL = {
        high: '高',
        medium: '中',
        low: '低',
    };

    const UI = {
        BUTTON_LABEL_PREFIX: '📷 ',
        BUTTON_LABEL_SUFFIX: 'を読み取って追加',
        OVERLAY_TITLE_PREFIX: '読み取り: ',
        NAME_LABEL: 'メーター名(任意)',
        TAKE_PHOTO_LABEL: '📷 写真を撮る／選ぶ',
        RECOGNIZE_LABEL: '数値を読み取る',
        APPLY_LABEL: 'この内容を追加する',
        CANCEL_LABEL: 'キャンセル',
        LOADING_PHOTO_LABEL: '写真を読み込んでいます。しばらくお待ちください...',
        RECOGNIZING_LABEL: '数値を読み取っています。しばらくお待ちください...',
        APPLYING_LABEL: '写真をアップロードして追加しています...',
        RESULT_LABEL: '読み取り結果(確認・修正してから追加してください)',
        TYPE_LABEL: '種類',
        VALUE_LABEL: '読み取った数値',
        UNIT_LABEL: '単位',
        NOTE_LABEL: 'AIのコメント(参考。誤読みの場合の手がかり)',
        LOW_CONFIDENCE_WARNING: '自信度が低いため、目視でも数値を確認してください。',
    };

    const MSGS = {
        NO_PHOTO: '写真を撮影または選択してください。',
        RECOGNIZE_FAILED: '数値の読み取りに失敗しました。',
        NOT_CONFIGURED:
            'GAS Web AppのURLまたは共有シークレットが未設定です。desktop.jsの GAS_WEB_APP_URL / GAS_SHARED_SECRET を実際の値に書き換えて、アップロードし直してください。',
        APPLY_FAILED: '追加に失敗しました。',
        IMAGE_LOAD_FAILED: '画像の読み込みに失敗しました。',
        IMAGE_CONVERT_FAILED: '画像の変換に失敗しました。',
        UPLOAD_FAILED: '写真のアップロードに失敗しました。',
        RESPONSE_PARSE_FAILED: 'GASからのレスポンスを解析できませんでした。',
        UNKNOWN_ERROR: '不明なエラーです。',
        SPACE_NOT_FOUND:
            'メーター読み取りボタンの設置先スペースが見つかりません(要素ID設定を確認してください)',
        ATTACHMENT_FAILED:
            'レコードの保存はできましたが、写真の反映に失敗しました。お手数ですが、対象の行へ手動で写真を追加してください。',
    };

    /**
     * 「追加する」時点ではまだレコードが保存されていないため、テーブル行の添付ファイル
     * フィールドのfileKeyをここに一時保持し、レコード保存成功後(submit.successイベント)に
     * REST APIでまとめて反映する。
     * @type {Array<{tableField: string, photoField: string, rowIndex: number, fileKey: string}>}
     */
    const pendingAttachments = [];

    // ==========================
    // 計算処理
    // DOM操作・API呼び出し・副作用は行わない純粋関数のみを置く。
    // ==========================

    /**
     * 長辺がmaxDimensionを超えないよう、アスペクト比を保ったままリサイズ後の寸法を計算する。
     * @param {number} width
     * @param {number} height
     * @param {number} maxDimension
     * @returns {{width: number, height: number}}
     */
    function computeResizedDimensions(width, height, maxDimension) {
        if (width <= maxDimension && height <= maxDimension) {
            return { width, height };
        }
        const scale = width >= height ? maxDimension / width : maxDimension / height;
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
        };
    }

    /**
     * data URL(例: "data:image/jpeg;base64,....")からBase64部分だけを取り出す。
     * @param {string} dataUrl
     * @returns {string}
     */
    function dataUrlToBase64(dataUrl) {
        const commaIndex = dataUrl.indexOf(',');
        return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    }

    /**
     * GAS Web Appからのレスポンス文字列を解析する。
     * GAS Web Appは仕様上doPostで任意のHTTPステータスを返せない(常に200)ため、
     * 成功/失敗はHTTPステータスではなくレスポンスJSONのokフィールドで判定する。
     * @param {string} responseText
     * @returns {{ok: boolean, result: (Object|null), error: (string|null)}}
     */
    function parseMeterVisionResponse(responseText) {
        let body;
        try {
            body = JSON.parse(responseText);
        } catch (error) {
            return { ok: false, result: null, error: MSGS.RESPONSE_PARSE_FAILED };
        }
        if (!body || body.ok !== true || !body.result) {
            return {
                ok: false,
                result: null,
                error: (body && body.error) || MSGS.UNKNOWN_ERROR,
            };
        }
        return { ok: true, result: body.result, error: null };
    }

    /**
     * Geminiが返す種類("analog"/"digital"/"unknown")を、kintoneのドロップダウンに
     * 設定する選択肢の文言へ変換する。未判定の場合は空文字(未選択)を返す。
     * @param {string} meterType
     * @returns {string}
     */
    function meterTypeToLabel(meterType) {
        return METER_TYPE_LABEL[meterType] || '';
    }

    /**
     * Geminiが返す自信度("high"/"medium"/"low")を、kintoneのドロップダウンに
     * 設定する選択肢の文言へ変換する。未判定の場合は空文字を返す。
     * @param {string} confidence
     * @returns {string}
     */
    function confidenceToLabel(confidence) {
        return CONFIDENCE_LABEL[confidence] || '';
    }

    /**
     * 自信度が"high"以外(目視確認を促すべき)かどうかを判定する。
     * @param {string} confidence
     * @returns {boolean}
     */
    function shouldWarnLowConfidence(confidence) {
        return confidence === 'medium' || confidence === 'low';
    }

    /**
     * 数値または文字列を、kintoneの数値フィールドへセットできる文字列へ正規化する。
     * null・undefined・空文字・数値として解釈できない値は空文字(フィールドを空にする値)にする。
     * @param {*} value
     * @returns {string}
     */
    function normalizeNumberInputValue(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        const num = Number(value);
        return Number.isFinite(num) ? String(num) : '';
    }

    /**
     * テーブルへ追加する1行分の値を組み立てる。
     * 【重要】kintoneの仕様上、JavaScript APIでテーブルへ新規行を追加する場合、
     * 各サブフィールドにフィールドタイプ(type)の指定が必要
     * (公式ドキュメント「フィールドの値を書き換える」のテーブルの注意事項を参照)。
     * @param {Object} fields - METER_TARGETSの1要素のfields
     * @param {Object} input  - {name, meterTypeLabel, value, unit, confidenceLabel, note}
     * @returns {Object} テーブルのvalue配列へpushする行オブジェクト
     */
    function buildMeterTableRow(fields, input) {
        return {
            value: {
                [fields.name]: { type: 'SINGLE_LINE_TEXT', value: input.name || '' },
                [fields.type]: { type: 'DROP_DOWN', value: input.meterTypeLabel || '' },
                [fields.value]: {
                    type: 'NUMBER',
                    value: normalizeNumberInputValue(input.value),
                },
                [fields.unit]: { type: 'SINGLE_LINE_TEXT', value: input.unit || '' },
                [fields.confidence]: {
                    type: 'DROP_DOWN',
                    value: input.confidenceLabel || '',
                },
                [fields.note]: { type: 'MULTI_LINE_TEXT', value: input.note || '' },
            },
        };
    }

    /**
     * pendingAttachments(保留中の添付ファイル一覧)と、保存成功イベントの
     * event.record(保存済みレコードのデータ)から、REST APIのrecordパラメーターを組み立てる。
     *
     * 【重要】テーブルフィールドをREST APIのPUTで更新する場合、リクエストに含めなかった行は
     * 削除される(ルートCLAUDE.mdの「テーブルフィールドをREST APIで更新するときの注意」参照)。
     * そのため、対象テーブルの既存の全行を{id}のみのオブジェクトとして含め、写真を反映する
     * 行だけ{id, value: {写真欄: {...}}}を指定する。
     * @param {Array<{tableField: string, photoField: string, rowIndex: number, fileKey: string}>} pending
     * @param {Object} savedRecord - 保存成功イベントのevent.record
     * @returns {Object} REST API(PUT)のrecordパラメーター
     */
    function buildMeterAttachmentPatch(pending, savedRecord) {
        const patch = {};
        const pendingByTable = {};
        pending.forEach((item) => {
            pendingByTable[item.tableField] = pendingByTable[item.tableField] || [];
            pendingByTable[item.tableField].push(item);
        });

        Object.keys(pendingByTable).forEach((tableField) => {
            const savedRows =
                (savedRecord[tableField] && savedRecord[tableField].value) || [];
            const pendingByIndex = {};
            pendingByTable[tableField].forEach((item) => {
                pendingByIndex[item.rowIndex] = item;
            });

            patch[tableField] = {
                value: savedRows.map((row, index) => {
                    const pendingItem = pendingByIndex[index];
                    if (!pendingItem) {
                        return { id: row.id };
                    }
                    return {
                        id: row.id,
                        value: {
                            [pendingItem.photoField]: {
                                value: [{ fileKey: pendingItem.fileKey }],
                            },
                        },
                    };
                }),
            };
        });

        return patch;
    }

    // ==========================
    // REST API処理
    // kintone REST API・GAS Web APIの呼び出しのみを行う。DOM操作・計算処理は行わない。
    // ==========================

    /**
     * 画像ファイルをcanvasで読み込み、長辺RESIZE_MAX_DIMENSION以下・JPEGへリサイズする。
     * 現場のネットワークが遅い前提で、送信量とGemini APIへのペイロードサイズを抑えるため。
     * @param {File} file
     * @returns {Promise<{blob: Blob, dataUrl: string}>}
     */
    function resizeImageFile(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            img.onload = () => {
                const { width, height } = computeResizedDimensions(
                    img.naturalWidth,
                    img.naturalHeight,
                    RESIZE_MAX_DIMENSION,
                );
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                URL.revokeObjectURL(objectUrl);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error(MSGS.IMAGE_CONVERT_FAILED));
                            return;
                        }
                        resolve({
                            blob,
                            dataUrl: canvas.toDataURL('image/jpeg', RESIZE_JPEG_QUALITY),
                        });
                    },
                    'image/jpeg',
                    RESIZE_JPEG_QUALITY,
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error(MSGS.IMAGE_LOAD_FAILED));
            };
            img.src = objectUrl;
        });
    }

    /**
     * BlobをBase64文字列に変換する。
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(dataUrlToBase64(String(reader.result)));
            reader.onerror = () => reject(new Error(MSGS.IMAGE_CONVERT_FAILED));
            reader.readAsDataURL(blob);
        });
    }

    /**
     * GAS Web Appへ画像を送り、メーターの読み取り結果を受け取る。
     * GAS Web AppはdoPostでOPTIONSプリフライトを処理できないため、プリフライトが
     * 発生しない Content-Type: text/plain で送信し、GAS側でJSONとして手動パースさせる。
     * @param {string} base64Image
     * @returns {Promise<{ok: boolean, result: (Object|null), error: (string|null)}>}
     */
    async function callMeterVisionApi(base64Image) {
        if (
            GAS_WEB_APP_URL.includes('REPLACE_WITH') ||
            GAS_SHARED_SECRET.includes('REPLACE_WITH')
        ) {
            throw new Error(MSGS.NOT_CONFIGURED);
        }
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                sharedSecret: GAS_SHARED_SECRET,
                imageBase64: base64Image,
            }),
        });
        const responseText = await response.text();
        return parseMeterVisionResponse(responseText);
    }

    /**
     * 写真をkintoneの一時保管領域へアップロードし、fileKeyを取得する。
     * 【重要】このAPIはkintone REST APIリクエストを送信するAPI(kintone.api())では実行できない
     * (公式ドキュメント「ファイルをアップロードする」の制限事項を参照)。そのためfetch()を直接使う。
     * @param {Blob}   blob
     * @param {string} filename
     * @returns {Promise<string>} fileKey
     */
    async function uploadFileToKintone(blob, filename) {
        const formData = new FormData();
        formData.append('__REQUEST_TOKEN__', kintone.getRequestToken());
        formData.append('file', blob, filename);

        // ゲストスペースのアプリでは /k/guest/スペースID/v1/file.json になるため、
        // kintone.api.url()(第2引数true)でゲストスペースを自動判定したURLを使う。
        const response = await fetch(kintone.api.url('/k/v1/file.json', true), {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: formData,
        });
        if (!response.ok) {
            throw new Error(`${MSGS.UPLOAD_FAILED}(status=${response.status})`);
        }
        const body = await response.json();
        return body.fileKey;
    }

    /**
     * 保存済みレコードへ、テーブル行の添付ファイルフィールドの値をREST APIで反映する。
     * 【重要】kintone.mobile.app.record.set()は添付ファイルフィールドへ値をセットできない
     * 仕様(公式ドキュメントの制限事項を参照。テーブル内でも同様)のため、レコードが
     * 保存された後にREST APIで改めて更新する必要がある。
     * @param {number} appId
     * @param {string} recordId
     * @param {string} revision
     * @param {Object} record - buildMeterAttachmentPatchが返すrecordパラメーター
     * @returns {Promise<Object>}
     */
    async function applyPendingAttachments(appId, recordId, revision, record) {
        const params = { app: appId, id: recordId, revision, record };
        return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', params);
    }

    // ==========================
    // UI処理
    // DOM生成・オーバーレイ表示・通知表示を行う。DOM操作を許可する唯一のセクション。
    // ==========================

    /**
     * メーター読み取り用の全画面オーバーレイのDOM要素一式を生成する(まだbodyへは追加しない)。
     * 独自のUI要素はHTML/CSSで実装する方針(UI設計方針)に基づき、kintone.createDialogでは
     * なく独自のフルスクリーンUIとする。
     * @param {Object} target - METER_TARGETSの1要素
     * @returns {Object} 生成した各要素への参照をまとめたオブジェクト
     */
    function createOverlay(target) {
        const overlay = document.createElement('div');
        overlay.className = 'meter-reader-overlay';

        const header = document.createElement('div');
        header.className = 'meter-reader-header';
        const title = document.createElement('h2');
        title.className = 'meter-reader-title';
        title.textContent = UI.OVERLAY_TITLE_PREFIX + target.label;
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'meter-reader-close-button';
        closeButton.textContent = '✕';
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'meter-reader-body';

        const nameLabel = document.createElement('label');
        nameLabel.className = 'meter-reader-field-label';
        nameLabel.textContent = UI.NAME_LABEL;
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'meter-reader-text-input';

        // capture指定により、カメラが起動できる環境ではカメラが直接起動する。
        // 起動できない環境では、OS標準のファイル選択メニューが表示される。
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');
        fileInput.hidden = true;

        const takePhotoButton = document.createElement('button');
        takePhotoButton.type = 'button';
        takePhotoButton.className = 'meter-reader-primary-button';
        takePhotoButton.textContent = UI.TAKE_PHOTO_LABEL;

        const previewImg = document.createElement('img');
        previewImg.className = 'meter-reader-preview';
        previewImg.alt = '';
        previewImg.hidden = true;

        const recognizeButton = document.createElement('button');
        recognizeButton.type = 'button';
        recognizeButton.className = 'meter-reader-primary-button';
        recognizeButton.textContent = UI.RECOGNIZE_LABEL;
        recognizeButton.disabled = true;

        const statusText = document.createElement('p');
        statusText.className = 'meter-reader-status';

        const resultSection = document.createElement('div');
        resultSection.className = 'meter-reader-result';
        resultSection.hidden = true;

        const resultLabel = document.createElement('p');
        resultLabel.className = 'meter-reader-result-label';
        resultLabel.textContent = UI.RESULT_LABEL;

        const typeLabel = document.createElement('label');
        typeLabel.className = 'meter-reader-field-label';
        typeLabel.textContent = UI.TYPE_LABEL;
        const typeSelect = document.createElement('select');
        typeSelect.className = 'meter-reader-select';
        [
            { value: '', text: '未選択' },
            { value: METER_TYPE_LABEL.analog, text: METER_TYPE_LABEL.analog },
            { value: METER_TYPE_LABEL.digital, text: METER_TYPE_LABEL.digital },
        ].forEach((option) => {
            const optionElm = document.createElement('option');
            optionElm.value = option.value;
            optionElm.textContent = option.text;
            typeSelect.appendChild(optionElm);
        });

        const valueLabel = document.createElement('label');
        valueLabel.className = 'meter-reader-field-label';
        valueLabel.textContent = UI.VALUE_LABEL;
        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.setAttribute('step', 'any');
        valueInput.className = 'meter-reader-text-input';

        const unitLabel = document.createElement('label');
        unitLabel.className = 'meter-reader-field-label';
        unitLabel.textContent = UI.UNIT_LABEL;
        const unitInput = document.createElement('input');
        unitInput.type = 'text';
        unitInput.className = 'meter-reader-text-input';

        const confidenceBadge = document.createElement('span');
        confidenceBadge.className = 'meter-reader-confidence-badge';

        const lowConfidenceWarning = document.createElement('p');
        lowConfidenceWarning.className = 'meter-reader-warning';
        lowConfidenceWarning.textContent = UI.LOW_CONFIDENCE_WARNING;
        lowConfidenceWarning.hidden = true;

        const noteLabel = document.createElement('label');
        noteLabel.className = 'meter-reader-field-label';
        noteLabel.textContent = UI.NOTE_LABEL;
        const noteTextarea = document.createElement('textarea');
        noteTextarea.className = 'meter-reader-textarea';

        resultSection.appendChild(resultLabel);
        resultSection.appendChild(typeLabel);
        resultSection.appendChild(typeSelect);
        resultSection.appendChild(valueLabel);
        resultSection.appendChild(valueInput);
        resultSection.appendChild(unitLabel);
        resultSection.appendChild(unitInput);
        resultSection.appendChild(confidenceBadge);
        resultSection.appendChild(lowConfidenceWarning);
        resultSection.appendChild(noteLabel);
        resultSection.appendChild(noteTextarea);

        const footer = document.createElement('div');
        footer.className = 'meter-reader-footer';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'meter-reader-secondary-button';
        cancelButton.textContent = UI.CANCEL_LABEL;
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.className = 'meter-reader-primary-button';
        applyButton.textContent = UI.APPLY_LABEL;
        applyButton.hidden = true;
        footer.appendChild(cancelButton);
        footer.appendChild(applyButton);

        body.appendChild(nameLabel);
        body.appendChild(nameInput);
        body.appendChild(fileInput);
        body.appendChild(takePhotoButton);
        body.appendChild(previewImg);
        body.appendChild(recognizeButton);
        body.appendChild(statusText);
        body.appendChild(resultSection);

        overlay.appendChild(header);
        overlay.appendChild(body);
        overlay.appendChild(footer);

        return {
            root: overlay,
            nameInput,
            fileInput,
            takePhotoButton,
            previewImg,
            recognizeButton,
            statusText,
            resultSection,
            typeSelect,
            valueInput,
            unitInput,
            confidenceBadge,
            lowConfidenceWarning,
            noteTextarea,
            cancelButton,
            applyButton,
            closeButton,
        };
    }

    /**
     * メーター読み取りオーバーレイを開き、撮影→読み取り→確認→追加の一連の操作を仲介する。
     * モバイル専用のため、kintone.mobile.app.record.*のAPIを直接呼び出す。
     * @param {Object} target - METER_TARGETSの1要素
     */
    function openMeterOverlay(target) {
        const notify = (text, type = 'INFO') =>
            kintone.mobile.showNotification(type, text);
        // kintoneの通知は全画面オーバーレイの背面に隠れて見えないことがあるため、
        // エラーはオーバーレイ内の状態表示にも出す。
        const showStatus = (text, isError = false, isBusy = false) => {
            ui.statusText.textContent = text;
            ui.statusText.classList.toggle('is-error', isError);
            ui.statusText.classList.toggle('is-busy', isBusy);
            if (text) {
                ui.statusText.scrollIntoView({ block: 'nearest' });
            }
        };
        const showError = (text) => {
            showStatus(text, true);
            notify(text, 'ERROR');
        };
        const ui = createOverlay(target);
        document.body.appendChild(ui.root);
        // オーバーレイの背面(レコード画面)がスクロールしてしまうのを防ぐ。
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        let resizedBlob = null;
        let currentConfidence = '';

        function close() {
            document.body.removeChild(ui.root);
            document.body.style.overflow = previousOverflow;
        }

        ui.closeButton.addEventListener('click', close);
        ui.cancelButton.addEventListener('click', close);
        ui.takePhotoButton.addEventListener('click', () => ui.fileInput.click());

        ui.fileInput.addEventListener('change', async () => {
            const file = ui.fileInput.files && ui.fileInput.files[0];
            // 同じ写真を続けて選んでもchangeが発火するよう、選択状態をクリアしておく
            ui.fileInput.value = '';
            if (!file) {
                return;
            }
            ui.takePhotoButton.disabled = true;
            ui.recognizeButton.disabled = true;
            showStatus(UI.LOADING_PHOTO_LABEL, false, true);
            try {
                const { blob, dataUrl } = await resizeImageFile(file);
                resizedBlob = blob;
                ui.previewImg.src = dataUrl;
                ui.previewImg.hidden = false;
                showStatus('');
            } catch (error) {
                showError(error.message);
            } finally {
                ui.takePhotoButton.disabled = false;
                ui.recognizeButton.disabled = !resizedBlob;
            }
        });

        ui.recognizeButton.addEventListener('click', async () => {
            if (!resizedBlob) {
                showError(MSGS.NO_PHOTO);
                return;
            }
            ui.recognizeButton.disabled = true;
            showStatus(UI.RECOGNIZING_LABEL, false, true);
            try {
                const base64 = await blobToBase64(resizedBlob);
                const response = await callMeterVisionApi(base64);
                if (!response.ok) {
                    throw new Error(response.error || MSGS.RECOGNIZE_FAILED);
                }
                const result = response.result;
                currentConfidence = result.confidence;
                ui.typeSelect.value = meterTypeToLabel(result.meterType);
                ui.valueInput.value = normalizeNumberInputValue(result.value);
                ui.unitInput.value = result.unit || '';
                ui.noteTextarea.value = result.rawLabel || '';
                ui.confidenceBadge.textContent = `自信度: ${confidenceToLabel(result.confidence) || '不明'}`;
                ui.confidenceBadge.className = `meter-reader-confidence-badge is-${result.confidence || 'unknown'}`;
                ui.lowConfidenceWarning.hidden = !shouldWarnLowConfidence(
                    result.confidence,
                );
                ui.resultSection.hidden = false;
                ui.applyButton.hidden = false;
                showStatus('');
            } catch (error) {
                console.error(error);
                showError(MSGS.RECOGNIZE_FAILED + '\n' + error.message);
            } finally {
                ui.recognizeButton.disabled = false;
            }
        });

        ui.applyButton.addEventListener('click', async () => {
            ui.applyButton.disabled = true;
            showStatus(UI.APPLYING_LABEL, false, true);
            try {
                // 添付ファイルフィールドはkintone.mobile.app.record.set()で値をセットできない
                // (公式ドキュメントの制限事項を参照)ため、fileKeyだけ保持しておき、
                // レコード保存成功後(submit.successイベント)にREST APIで反映する。
                const fileKey = await uploadFileToKintone(resizedBlob, 'meter.jpg');

                const record = kintone.mobile.app.record.get();
                const tableValue = record.record[target.tableField].value;
                const rowIndex = tableValue.length;
                tableValue.push(
                    buildMeterTableRow(target.fields, {
                        name: ui.nameInput.value,
                        meterTypeLabel: ui.typeSelect.value,
                        value: ui.valueInput.value,
                        unit: ui.unitInput.value,
                        confidenceLabel: confidenceToLabel(currentConfidence),
                        note: ui.noteTextarea.value,
                    }),
                );
                kintone.mobile.app.record.set(record);

                pendingAttachments.push({
                    tableField: target.tableField,
                    photoField: target.fields.photo,
                    rowIndex,
                    fileKey,
                });

                close();
                notify(
                    `「${target.label}」の読み取り結果を一覧に追加しました。写真は保存後に反映されます。`,
                    'SUCCESS',
                );
            } catch (error) {
                console.error(error);
                showError(MSGS.APPLY_FAILED + '\n' + error.message);
            } finally {
                ui.applyButton.disabled = false;
            }
        });
    }

    // ==========================
    // イベント制御
    // イベント登録のみを行う(計算処理→API処理→UI処理の呼び出し)。
    // 本カスタマイズはモバイル専用のため、kintone.mobile.*のイベントのみを登録する。
    // ==========================

    /**
     * レコード追加・編集画面の表示時、METER_TARGETSの各対象についてスペース要素へ
     * 「メーターを読み取って追加」ボタンを設置する。
     *
     * 【重要】スペースフィールドはテーブルの内部には配置できないため、ボタンは
     * テーブルの直前に配置したスペースフィールド(getSpaceElement)に設置する。
     * @param {Object} event
     * @returns {Object} event
     */
    function attachMeterButtons(event) {
        METER_TARGETS.forEach((target) => {
            const spaceElm = kintone.mobile.app.record.getSpaceElement(target.spaceId);
            if (!spaceElm) {
                console.warn(`${MSGS.SPACE_NOT_FOUND}: spaceId=${target.spaceId}`);
                return;
            }
            if (spaceElm.querySelector(`.${BUTTON_CLASS}`)) {
                return;
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = `${BUTTON_CLASS} kintoneplugin-button-normal`;
            button.textContent =
                UI.BUTTON_LABEL_PREFIX + target.label + UI.BUTTON_LABEL_SUFFIX;
            button.addEventListener('click', () => openMeterOverlay(target));
            spaceElm.appendChild(button);
        });
        return event;
    }

    /**
     * レコード保存成功後、保留中の添付ファイル(pendingAttachments)があれば
     * REST APIでまとめて反映する。submit.successはPromiseに対応しているため、
     * asyncハンドラーをそのまま返せる。
     * @param {Object} event
     * @returns {Promise<Object>} event
     */
    async function handleSubmitSuccess(event) {
        if (pendingAttachments.length === 0 || !event.record) {
            return event;
        }

        const pending = pendingAttachments.splice(0, pendingAttachments.length);

        try {
            const patch = buildMeterAttachmentPatch(pending, event.record);
            await applyPendingAttachments(
                event.appId,
                event.recordId,
                event.record.$revision.value,
                patch,
            );
        } catch (error) {
            console.error(error);
            kintone.mobile.showNotification(
                'ERROR',
                MSGS.ATTACHMENT_FAILED + '\n' + error.message,
            );
        }
        return event;
    }

    kintone.events.on(
        ['mobile.app.record.create.show', 'mobile.app.record.edit.show'],
        attachMeterButtons,
    );
    kintone.events.on(
        [
            'mobile.app.record.create.submit.success',
            'mobile.app.record.edit.submit.success',
        ],
        handleSubmitSuccess,
    );

    // Vitestからのテスト用に、計算処理の純粋関数とエラーメッセージ定数を
    // CommonJS export経由で公開する。kintone(ブラウザ)実行時はmoduleが
    // 存在しないため、このブロックは実行されない。
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            computeResizedDimensions,
            dataUrlToBase64,
            parseMeterVisionResponse,
            meterTypeToLabel,
            confidenceToLabel,
            shouldWarnLowConfidence,
            normalizeNumberInputValue,
            buildMeterTableRow,
            buildMeterAttachmentPatch,
            MSGS,
        };
    }
})();
