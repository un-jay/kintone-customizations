// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : メイン処理(desktop.js)
//     Description : 紙の手書きメモを撮影し、GAS Web App経由でAzure AI Vision(Read機能)
//                   により文字起こしして、指定フィールドへ書き込むカスタマイズ。
//                   対象アプリはHANDWRITING_TARGETSに定義したフィールドコード・
//                   スペース要素IDで作成されている前提。詳細はCLAUDE.mdを参照。
// ======================================================================

(() => {
    'use strict';

    // ==========================
    // 定数
    // ==========================

    /**
     * 手書き入力の対象フィールドの組。1アプリに複数設定できる。
     * textField  : 認識結果を書き込む文字列(複数行)フィールド
     * imageField : 撮影した写真の原本を保存する添付ファイルフィールド
     * spaceId    : ボタンを設置するスペースフィールドの要素ID
     * label      : ボタン・見出しに表示する名称
     */
    const HANDWRITING_TARGETS = [
        {
            textField: 'WORK_NOTES',
            imageField: 'WORK_NOTES_PHOTO',
            spaceId: 'space_work_notes',
            label: '作業内容',
        },
        {
            textField: 'REMARKS',
            imageField: 'REMARKS_PHOTO',
            spaceId: 'space_remarks',
            label: '気づき・特記事項',
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

    const BUTTON_CLASS = 'handwriting-input-trigger-button';

    const UI = {
        BUTTON_LABEL_PREFIX: '📷 ',
        BUTTON_LABEL_SUFFIX: 'を手書きメモから読み取る',
        OVERLAY_TITLE_PREFIX: '手書きメモの読み取り: ',
        TAKE_PHOTO_LABEL: '写真を撮る/選ぶ',
        RETAKE_LABEL: '撮り直す',
        RECOGNIZE_LABEL: '文字にする',
        APPLY_LABEL: 'この内容を反映する',
        CANCEL_LABEL: 'キャンセル',
        RECOGNIZING_LABEL: '文字を認識しています...',
        APPLYING_LABEL: '反映しています...',
        PREVIEW_LABEL: '認識結果(確認・修正してから反映してください)',
    };

    const MSGS = {
        NO_PHOTO: '写真を撮影または選択してください。',
        RECOGNIZE_FAILED: '文字の認識に失敗しました。',
        APPLY_FAILED: '反映に失敗しました。',
        IMAGE_LOAD_FAILED: '画像の読み込みに失敗しました。',
        IMAGE_CONVERT_FAILED: '画像の変換に失敗しました。',
        UPLOAD_FAILED: '写真のアップロードに失敗しました。',
        RESPONSE_PARSE_FAILED: 'GASからのレスポンスを解析できませんでした。',
        UNKNOWN_ERROR: '不明なエラーです。',
        SPACE_NOT_FOUND:
            '手書き入力ボタンの設置先スペースが見つかりません(要素ID設定を確認してください)',
    };

    // ==========================
    // 計算処理
    // DOM操作・API呼び出し・副作用は行わない純粋関数のみを置く。
    // ==========================

    /**
     * 既存のフィールド値の末尾に、認識結果を改行を挟んで追記する。
     * 1日の中で複数回メモを取り込む運用を想定し、上書きではなく追記にする。
     * @param {string} existingValue   - 追記先フィールドの現在の値
     * @param {string} recognizedText  - OCRで認識したテキスト
     * @returns {string}
     */
    function appendRecognizedText(existingValue, recognizedText) {
        const trimmedExisting = (existingValue || '').trim();
        const trimmedNew = (recognizedText || '').trim();
        if (!trimmedNew) {
            return existingValue || '';
        }
        if (!trimmedExisting) {
            return trimmedNew;
        }
        return `${existingValue}\n${trimmedNew}`;
    }

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
     * @returns {{ok: boolean, text: string, error: string|null}}
     */
    function parseOcrResponse(responseText) {
        let body;
        try {
            body = JSON.parse(responseText);
        } catch (error) {
            return { ok: false, text: '', error: MSGS.RESPONSE_PARSE_FAILED };
        }
        if (!body || body.ok !== true) {
            return {
                ok: false,
                text: '',
                error: (body && body.error) || MSGS.UNKNOWN_ERROR,
            };
        }
        return { ok: true, text: body.text || '', error: null };
    }

    // ==========================
    // REST API処理
    // kintone REST API・GAS Web APIの呼び出しのみを行う。DOM操作・計算処理は行わない。
    // ==========================

    /**
     * 画像ファイルをcanvasで読み込み、長辺RESIZE_MAX_DIMENSION以下・JPEGへリサイズする。
     * 現場のネットワークが遅い前提で、送信量とAzureへのペイロードサイズを抑えるため。
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
     * GAS Web Appへ画像を送り、OCR結果を受け取る。
     * GAS Web AppはdoPostでOPTIONSプリフライトを処理できないため、プリフライトが
     * 発生しない Content-Type: text/plain で送信し、GAS側でJSONとして手動パースさせる
     * (実体はJSONだが、ヘッダー上はtext/plainにすることでブラウザのプリフライトを回避する、
     * GAS Web Appの定番の回避策)。
     * @param {string} base64Image
     * @returns {Promise<{ok: boolean, text: string, error: string|null}>}
     */
    async function callHandwritingOcr(base64Image) {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                sharedSecret: GAS_SHARED_SECRET,
                imageBase64: base64Image,
            }),
        });
        const responseText = await response.text();
        return parseOcrResponse(responseText);
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

        const response = await fetch('/k/v1/file.json', {
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

    // ==========================
    // UI処理
    // DOM生成・オーバーレイ表示・通知表示を行う。DOM操作を許可する唯一のセクション。
    // ==========================

    /**
     * 手書き読み取り用の全画面オーバーレイのDOM要素一式を生成する(まだbodyへは追加しない)。
     * マス目キャンバス等を含む複雑なUIのため、kintone.createDialogではなく独自のフルスクリーン
     * UIとする(UI設計方針の「独自のUI要素はHTML/CSSで実装する」に基づく)。
     * @param {Object} target - HANDWRITING_TARGETSの1要素
     * @returns {Object} 生成した各要素への参照をまとめたオブジェクト
     */
    function createOverlay(target) {
        const overlay = document.createElement('div');
        overlay.className = 'handwriting-input-overlay';

        const header = document.createElement('div');
        header.className = 'handwriting-input-header';
        const title = document.createElement('h2');
        title.className = 'handwriting-input-title';
        title.textContent = UI.OVERLAY_TITLE_PREFIX + target.label;
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'handwriting-input-close-button';
        closeButton.textContent = '✕';
        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'handwriting-input-body';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.setAttribute('capture', 'environment');
        fileInput.className = 'handwriting-input-file-input';
        fileInput.hidden = true;

        const takePhotoButton = document.createElement('button');
        takePhotoButton.type = 'button';
        takePhotoButton.className = 'handwriting-input-primary-button';
        takePhotoButton.textContent = UI.TAKE_PHOTO_LABEL;

        const previewImg = document.createElement('img');
        previewImg.className = 'handwriting-input-preview';
        previewImg.alt = '';
        previewImg.hidden = true;

        const recognizeButton = document.createElement('button');
        recognizeButton.type = 'button';
        recognizeButton.className = 'handwriting-input-primary-button';
        recognizeButton.textContent = UI.RECOGNIZE_LABEL;
        recognizeButton.disabled = true;

        const statusText = document.createElement('p');
        statusText.className = 'handwriting-input-status';

        const previewLabel = document.createElement('label');
        previewLabel.className = 'handwriting-input-preview-label';
        previewLabel.textContent = UI.PREVIEW_LABEL;
        previewLabel.hidden = true;

        const textArea = document.createElement('textarea');
        textArea.className = 'handwriting-input-textarea';
        textArea.hidden = true;

        const footer = document.createElement('div');
        footer.className = 'handwriting-input-footer';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'handwriting-input-secondary-button';
        cancelButton.textContent = UI.CANCEL_LABEL;
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.className = 'handwriting-input-primary-button';
        applyButton.textContent = UI.APPLY_LABEL;
        applyButton.hidden = true;
        footer.appendChild(cancelButton);
        footer.appendChild(applyButton);

        body.appendChild(fileInput);
        body.appendChild(takePhotoButton);
        body.appendChild(previewImg);
        body.appendChild(recognizeButton);
        body.appendChild(statusText);
        body.appendChild(previewLabel);
        body.appendChild(textArea);

        overlay.appendChild(header);
        overlay.appendChild(body);
        overlay.appendChild(footer);

        return {
            root: overlay,
            fileInput,
            takePhotoButton,
            previewImg,
            recognizeButton,
            statusText,
            previewLabel,
            textArea,
            cancelButton,
            applyButton,
            closeButton,
        };
    }

    /**
     * kintone通知でメッセージを表示する。
     * @param {string} text
     * @param {'INFO'|'SUCCESS'|'ERROR'} [type]
     */
    function notify(text, type = 'INFO') {
        kintone.showNotification(type, text);
    }

    /**
     * 手書き読み取りオーバーレイを開き、撮影→認識→確認→反映の一連の操作を仲介する。
     * @param {Object} target - HANDWRITING_TARGETSの1要素
     */
    function openHandwritingOverlay(target) {
        const ui = createOverlay(target);
        document.body.appendChild(ui.root);

        let resizedBlob = null;

        function close() {
            document.body.removeChild(ui.root);
        }

        ui.closeButton.addEventListener('click', close);
        ui.cancelButton.addEventListener('click', close);
        ui.takePhotoButton.addEventListener('click', () => ui.fileInput.click());

        ui.fileInput.addEventListener('change', async () => {
            const file = ui.fileInput.files && ui.fileInput.files[0];
            if (!file) {
                return;
            }
            try {
                const { blob, dataUrl } = await resizeImageFile(file);
                resizedBlob = blob;
                ui.previewImg.src = dataUrl;
                ui.previewImg.hidden = false;
                ui.recognizeButton.disabled = false;
                ui.takePhotoButton.textContent = UI.RETAKE_LABEL;
            } catch (error) {
                notify(error.message, 'ERROR');
            }
        });

        ui.recognizeButton.addEventListener('click', async () => {
            if (!resizedBlob) {
                notify(MSGS.NO_PHOTO, 'ERROR');
                return;
            }
            ui.recognizeButton.disabled = true;
            ui.statusText.textContent = UI.RECOGNIZING_LABEL;
            try {
                const base64 = await blobToBase64(resizedBlob);
                const result = await callHandwritingOcr(base64);
                if (!result.ok) {
                    throw new Error(result.error || MSGS.RECOGNIZE_FAILED);
                }
                const record = kintone.app.record.get();
                const existingValue = record.record[target.textField].value;
                ui.textArea.value = appendRecognizedText(existingValue, result.text);
                ui.textArea.hidden = false;
                ui.previewLabel.hidden = false;
                ui.applyButton.hidden = false;
            } catch (error) {
                notify(MSGS.RECOGNIZE_FAILED + '\n' + error.message, 'ERROR');
            } finally {
                ui.statusText.textContent = '';
                ui.recognizeButton.disabled = false;
            }
        });

        ui.applyButton.addEventListener('click', async () => {
            ui.applyButton.disabled = true;
            ui.statusText.textContent = UI.APPLYING_LABEL;
            try {
                const fileKey = await uploadFileToKintone(resizedBlob, 'handwriting.jpg');
                const record = kintone.app.record.get();
                record.record[target.textField].value = ui.textArea.value;
                record.record[target.imageField].value = [{ fileKey }];
                kintone.app.record.set(record);
                close();
                notify(`「${target.label}」に反映しました。`, 'SUCCESS');
            } catch (error) {
                notify(MSGS.APPLY_FAILED + '\n' + error.message, 'ERROR');
            } finally {
                ui.applyButton.disabled = false;
                ui.statusText.textContent = '';
            }
        });
    }

    // ==========================
    // イベント制御
    // イベント登録のみを行う(計算処理→API処理→UI処理の呼び出し)。
    // ==========================

    /**
     * レコード追加・編集画面の表示時、HANDWRITING_TARGETSの各対象について
     * スペース要素へ「手書きメモを読み取る」ボタンを設置する。
     *
     * 【重要】kintone.app.record.getFieldElement()はレコード詳細画面専用のAPIで、
     * レコード追加・編集画面では使用できない。そのためボタンの設置先には、
     * 対象アプリにあらかじめ配置したスペースフィールド(getSpaceElement)を使う。
     */
    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {
        HANDWRITING_TARGETS.forEach((target) => {
            const spaceElm = kintone.app.record.getSpaceElement(target.spaceId);
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
            button.addEventListener('click', () => openHandwritingOverlay(target));
            spaceElm.appendChild(button);
        });
        return event;
    });

    // Vitestからのテスト用に、計算処理の純粋関数とエラーメッセージ定数を
    // CommonJS export経由で公開する。kintone(ブラウザ)実行時はmoduleが
    // 存在しないため、このブロックは実行されない。
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            appendRecognizedText,
            computeResizedDimensions,
            dataUrlToBase64,
            parseOcrResponse,
            MSGS,
        };
    }
})();
