// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/17        J.Yamamoto      :kintone.app.record.set()は添付ファイル
//                                                フィールドへ値をセットできない仕様
//                                                (公式ドキュメントの制限事項に明記)のため、
//                                                写真が反映されない不具合を修正。
//                                                「反映する」時点ではfileKeyを保持するだけにし、
//                                                レコード保存成功イベント(submit.success)で
//                                                REST APIにより添付ファイルフィールドを
//                                                改めて更新するように変更
//  V1.2.0     2026/09/25        J.Yamamoto      :写真のアップロードURLが/k/v1/file.json固定
//                                                だったため、ゲストスペースのアプリで失敗する
//                                                可能性があった。kintone.api.url()で
//                                                ゲストスペースを自動判定するように変更
//  V1.3.0     2026/09/25        J.Yamamoto      :モバイル(kintone.mobile.*)に対応。PC用・モバイル用の
//                                                両方に同じファイルをアップロードして共用する。
//                                                スマホで「撮影する」(カメラ直接起動)と
//                                                「写真を選ぶ」(写真ライブラリ等から選択)を
//                                                使い分けられるよう、ファイル入力を2つに分けた
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
        TAKE_PHOTO_LABEL: '📷 撮影する',
        PICK_PHOTO_LABEL: '🖼 写真を選ぶ',
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
        ATTACHMENT_FAILED:
            'レコードの保存はできましたが、写真の添付に失敗しました。お手数ですが、対象の添付ファイルフィールドへ手動で写真を追加してください。',
    };

    /**
     * 「反映する」時点ではまだレコードが保存されていないため、添付ファイルフィールドの
     * fileKeyをここに一時保持し、レコード保存成功後(submit.successイベント)にREST APIで
     * まとめて反映する。キー: imageField、値: fileKey。
     * @type {Object<string, string>}
     */
    const pendingAttachments = {};

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

    /**
     * pendingAttachments(imageField→fileKeyのマップ)から、REST APIのrecordパラメーターの
     * 一部(添付ファイルフィールド分)を組み立てる。
     * @param {Object<string, string>} pending
     * @returns {Object} { [imageField]: { value: [{ fileKey }] } } の形式
     */
    function buildAttachmentRecordPatch(pending) {
        const record = {};
        Object.keys(pending).forEach((imageField) => {
            record[imageField] = { value: [{ fileKey: pending[imageField] }] };
        });
        return record;
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
     * 保存済みレコードへ、添付ファイルフィールドの値をREST APIで反映する。
     * 【重要】kintone.app.record.set()は添付ファイルフィールドへ値をセットできない仕様
     * (公式ドキュメント「レコードに値をセットする」の制限事項を参照)のため、
     * レコードが保存された後にREST APIで改めて更新する必要がある。
     * @param {number} appId
     * @param {string} recordId
     * @param {string} revision
     * @param {Object<string, string>} pending - imageField→fileKeyのマップ
     * @returns {Promise<Object>}
     */
    async function applyPendingAttachments(appId, recordId, revision, pending) {
        const params = {
            app: appId,
            id: recordId,
            revision,
            record: buildAttachmentRecordPatch(pending),
        };
        return kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', params);
    }

    // ==========================
    // UI処理
    // DOM生成・オーバーレイ表示・通知表示を行う。DOM操作を許可する唯一のセクション。
    // ==========================

    /**
     * 手書き読み取り用の全画面オーバーレイのDOM要素一式を生成する(まだbodyへは追加しない)。
     * マス目キャンバス等を含む複雑なUIのため、kintone.createDialogではなく独自のフルスクリーン
     * UIとする(UI設計方針の「独自のUI要素はHTML/CSSで実装する」に基づく)。
     * @param {Object}  target     - HANDWRITING_TARGETSの1要素
     * @param {boolean} showCamera - 「撮影する」ボタンを表示するか(タッチ端末のみ)
     * @returns {Object} 生成した各要素への参照をまとめたオブジェクト
     */
    function createOverlay(target, showCamera) {
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

        // 撮影用(capture指定: スマホ・タブレットでカメラが直接起動する)と、
        // 選択用(capture無し: 写真ライブラリ・ファイルから選べる)の2つを用意する。
        const cameraInput = document.createElement('input');
        cameraInput.type = 'file';
        cameraInput.accept = 'image/*';
        cameraInput.setAttribute('capture', 'environment');
        cameraInput.hidden = true;

        const galleryInput = document.createElement('input');
        galleryInput.type = 'file';
        galleryInput.accept = 'image/*';
        galleryInput.hidden = true;

        const photoButtons = document.createElement('div');
        photoButtons.className = 'handwriting-input-photo-buttons';

        const takePhotoButton = document.createElement('button');
        takePhotoButton.type = 'button';
        takePhotoButton.className = 'handwriting-input-primary-button';
        takePhotoButton.textContent = UI.TAKE_PHOTO_LABEL;
        takePhotoButton.hidden = !showCamera;

        const pickPhotoButton = document.createElement('button');
        pickPhotoButton.type = 'button';
        pickPhotoButton.className = 'handwriting-input-primary-button';
        pickPhotoButton.textContent = UI.PICK_PHOTO_LABEL;

        photoButtons.appendChild(takePhotoButton);
        photoButtons.appendChild(pickPhotoButton);

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

        body.appendChild(cameraInput);
        body.appendChild(galleryInput);
        body.appendChild(photoButtons);
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
            cameraInput,
            galleryInput,
            takePhotoButton,
            pickPhotoButton,
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
     * PC用・モバイル用でkintone JS APIの名前空間が異なる(kintone.app.* と
     * kintone.mobile.app.*)ため、画面ごとに使うAPIをここで切り替える。
     * 同じjs/cssをPC用・モバイル用の両方にアップロードして共用する。
     * (kintone.mobileはPC画面には存在しないため、必ず呼び出し時に評価する)
     */
    const PLATFORM = {
        desktop: {
            isMobile: false,
            getSpaceElement: (id) => kintone.app.record.getSpaceElement(id),
            getRecord: () => kintone.app.record.get(),
            setRecord: (record) => kintone.app.record.set(record),
            notify: (text, type) => kintone.showNotification(type, text),
        },
        mobile: {
            isMobile: true,
            getSpaceElement: (id) => kintone.mobile.app.record.getSpaceElement(id),
            getRecord: () => kintone.mobile.app.record.get(),
            setRecord: (record) => kintone.mobile.app.record.set(record),
            notify: (text, type) => kintone.mobile.showNotification(type, text),
        },
    };

    /**
     * 手書き読み取りオーバーレイを開き、撮影→認識→確認→反映の一連の操作を仲介する。
     * @param {Object} target   - HANDWRITING_TARGETSの1要素
     * @param {Object} platform - PLATFORM.desktop または PLATFORM.mobile
     */
    function openHandwritingOverlay(target, platform) {
        const notify = (text, type = 'INFO') => platform.notify(text, type);
        // スマホ・タブレット(タッチ端末)では「撮影する」ボタンも表示する。
        const showCamera = platform.isMobile || navigator.maxTouchPoints > 0;
        const ui = createOverlay(target, showCamera);
        document.body.appendChild(ui.root);
        // オーバーレイの背面(レコード画面)がスクロールしてしまうのを防ぐ。
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        let resizedBlob = null;

        function close() {
            document.body.removeChild(ui.root);
            document.body.style.overflow = previousOverflow;
        }

        ui.closeButton.addEventListener('click', close);
        ui.cancelButton.addEventListener('click', close);
        ui.takePhotoButton.addEventListener('click', () => ui.cameraInput.click());
        ui.pickPhotoButton.addEventListener('click', () => ui.galleryInput.click());

        async function onPhotoSelected(input) {
            const file = input.files && input.files[0];
            input.value = '';
            if (!file) {
                return;
            }
            try {
                const { blob, dataUrl } = await resizeImageFile(file);
                resizedBlob = blob;
                ui.previewImg.src = dataUrl;
                ui.previewImg.hidden = false;
                ui.recognizeButton.disabled = false;
            } catch (error) {
                notify(error.message, 'ERROR');
            }
        }
        ui.cameraInput.addEventListener('change', () => onPhotoSelected(ui.cameraInput));
        ui.galleryInput.addEventListener('change', () =>
            onPhotoSelected(ui.galleryInput),
        );

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
                const record = platform.getRecord();
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
                // 添付ファイルフィールドはkintone.app.record.set()で値をセットできない
                // (公式ドキュメントの制限事項を参照)ため、fileKeyだけ保持しておき、
                // レコード保存成功後(submit.successイベント)にREST APIで反映する。
                const fileKey = await uploadFileToKintone(resizedBlob, 'handwriting.jpg');
                pendingAttachments[target.imageField] = fileKey;

                const record = platform.getRecord();
                record.record[target.textField].value = ui.textArea.value;
                platform.setRecord(record);
                close();
                notify(
                    `「${target.label}」に反映しました。写真は保存後に添付されます。`,
                    'SUCCESS',
                );
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
     * スペース要素へ「手書きメモを読み取る」ボタンを設置する(PC・モバイル共通)。
     *
     * 【重要】kintone.app.record.getFieldElement()はレコード詳細画面専用のAPIで、
     * レコード追加・編集画面では使用できない。そのためボタンの設置先には、
     * 対象アプリにあらかじめ配置したスペースフィールド(getSpaceElement)を使う。
     * @param {Object} platform - PLATFORM.desktop または PLATFORM.mobile
     * @returns {Function} kintone.events.on()に渡すハンドラー
     */
    function createShowHandler(platform) {
        return (event) => {
            HANDWRITING_TARGETS.forEach((target) => {
                const spaceElm = platform.getSpaceElement(target.spaceId);
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
                button.addEventListener('click', () =>
                    openHandwritingOverlay(target, platform),
                );
                spaceElm.appendChild(button);
            });
            return event;
        };
    }

    /**
     * レコード保存成功後、保留中の添付ファイル(pendingAttachments)があれば
     * REST APIでまとめて反映する。add/edit.submit.successはPromiseに対応しているため、
     * asyncハンドラーをそのまま返せる。
     * @param {Object} platform - PLATFORM.desktop または PLATFORM.mobile
     * @returns {Function} kintone.events.on()に渡すハンドラー
     */
    function createSubmitSuccessHandler(platform) {
        return async (event) => {
            const pendingImageFields = Object.keys(pendingAttachments);
            if (pendingImageFields.length === 0 || !event.record) {
                return event;
            }

            const pending = { ...pendingAttachments };
            pendingImageFields.forEach(
                (imageField) => delete pendingAttachments[imageField],
            );

            try {
                await applyPendingAttachments(
                    event.appId,
                    event.recordId,
                    event.record.$revision.value,
                    pending,
                );
            } catch (error) {
                console.error(error);
                platform.notify(MSGS.ATTACHMENT_FAILED + '\n' + error.message, 'ERROR');
            }
            return event;
        };
    }

    // PC用・モバイル用のどちらの画面でも動くよう、両方のイベントを登録する
    // (PC用・モバイル用は別々に読み込まれ、該当しない側のイベントは発火しない)。
    kintone.events.on(
        ['app.record.create.show', 'app.record.edit.show'],
        createShowHandler(PLATFORM.desktop),
    );
    kintone.events.on(
        ['mobile.app.record.create.show', 'mobile.app.record.edit.show'],
        createShowHandler(PLATFORM.mobile),
    );
    kintone.events.on(
        ['app.record.create.submit.success', 'app.record.edit.submit.success'],
        createSubmitSuccessHandler(PLATFORM.desktop),
    );
    kintone.events.on(
        [
            'mobile.app.record.create.submit.success',
            'mobile.app.record.edit.submit.success',
        ],
        createSubmitSuccessHandler(PLATFORM.mobile),
    );

    // Vitestからのテスト用に、計算処理の純粋関数とエラーメッセージ定数を
    // CommonJS export経由で公開する。kintone(ブラウザ)実行時はmoduleが
    // 存在しないため、このブロックは実行されない。
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            appendRecognizedText,
            computeResizedDimensions,
            dataUrlToBase64,
            parseOcrResponse,
            buildAttachmentRecordPatch,
            MSGS,
        };
    }
})();
