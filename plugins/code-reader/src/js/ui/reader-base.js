// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/18        J.Yamamoto      :カメラ前面/背面選択に対応
//  V1.2.0     2026/08/19        J.Yamamoto      :kintone.showNotification()の引数を
//                                                正しい(type, message)形式に修正
// ----------------------------------------------------------------------
//     ModuleName  : コードリーダー共通基底クラス(reader-base.js)
//     Description : QR/バーコードリーダー共通の基底クラス
//                   カメラ制御・UI生成を担当し、スキャン処理はサブクラスで実装する。
//                   カメラ・確認ダイアログともにkintone APIを使用する
//                   （PC: kintone.createDialog / Mobile: kintone.mobile.createBottomSheet）。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.CodeReaderPlugin;

    /**
     * QR/バーコードリーダー共通の基底クラス。
     * DOM操作・カメラ制御を含む一体のUIコンポーネントのため、他のui.js相当のロジックと
     * まとめて js/ui/ 配下に置く。desktop.js からはこのクラス(のサブクラス)の生成・
     * イベント登録のみを行い、DOM操作は行わない。
     */
    class CodeReaderBase {
        /**
         * @param {Object}      params
         * @param {HTMLElement} params.headerElm - ボタンを追加する親要素
         * @param {boolean}     [params.isMobile] - モバイル版かどうか(kintone API選択に使用)
         * @param {string}      [params.facingMode] - カメラの向き('environment'/'user')。省略時は既定値
         */
        constructor({ headerElm, isMobile = false, facingMode }) {
            this.headerElm = headerElm;
            this.isMobile = isMobile;
            this.facingMode = facingMode || CONST.CAMERA.DEFAULT_FACING_MODE;
            this._okHandler = null;
            this._initializeState();
            this._createElements();
        }

        _initializeState() {
            this.stream = null;
            this.reading = false;
            this._cameraDialog = null;
        }

        _createElements() {
            this._createVideo();
            this._createCanvas();
        }

        _createVideo() {
            this.video = document.createElement('video');
            this.video.className = CONST.CLASS_NAMES.VIDEO;
            this.video.setAttribute('playsinline', ''); // iOS対応
        }

        /** QRコード解析用Canvas(DOMには追加しない) */
        _createCanvas() {
            this.canvas = document.createElement('canvas');
        }

        /**
         * @param {string} text
         * @param {string} className
         * @returns {HTMLButtonElement}
         */
        createButton(text, className) {
            const btn = document.createElement('button');
            btn.className = className;
            btn.textContent = text;
            return btn;
        }

        /**
         * 読み取り完了時に呼び出すハンドラーを設定する。
         * @param {(code: string) => void} handler
         */
        setOkHandler(handler) {
            this._okHandler = handler;
        }

        /** カメラを起動してスキャンを開始する */
        async start() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this._showNotification(
                    `${CONST.MSGS.CAMERA_SUPPORT_ERROR} 使用ブラウザ[${navigator.userAgent}]`,
                );
                return;
            }
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: this.facingMode },
                });
                this.video.srcObject = this.stream;
                await this.video.play();
                this.reading = true;
                this._startScanning();
                await this._openCameraDialog();
            } catch (err) {
                this._showNotification(CONST.MSGS.START_CAMERA_ERROR + err.message);
            }
        }

        /** カメラを停止してリソースを解放する */
        stop() {
            this._stopScanning();
            if (this.stream) {
                this.stream.getTracks().forEach((trk) => trk.stop());
                this.stream = null;
            }
            this.reading = false;
        }

        /** スキャン開始(サブクラスで実装) */
        _startScanning() {}

        /** スキャン停止(サブクラスで実装) */
        _stopScanning() {}

        /** カメラダイアログのタイトル(サブクラスで実装) */
        _getCameraTitle() {
            return '';
        }

        /**
         * kintone APIでカメラダイアログを表示する。
         * ×ボタンでカメラを停止。show()はawaitしない(スキャンループと並行)。
         */
        async _openCameraDialog() {
            const params = {
                title: this._getCameraTitle(),
                body: this.video,
                showCancelButton: false,
                showCloseButton: true,
                beforeClose: () => {
                    this.stop();
                },
            };

            if (this.isMobile) {
                this._cameraDialog = await kintone.mobile.createBottomSheet(params);
            } else {
                this._cameraDialog = await kintone.createDialog(params);
            }

            this._cameraDialog.show(); // awaitしない(スキャンと並行して動作)
        }

        /**
         * 読み取り結果をkintone確認ダイアログで表示する。
         * OK → okHandlerを実行 / 再取得 → カメラを再起動
         * @param {string} code - 読み取ったコード
         */
        async _showResult(code) {
            this.stop();

            if (this._cameraDialog) {
                this._cameraDialog.close();
                this._cameraDialog = null;
            }

            const UI = CONST.UI;
            const CONFIRM = CONST.CONFIRM_RESULT;

            const contentElm = document.createElement('p');
            contentElm.textContent = code;

            const params = {
                title: UI.CONFIRM_TITLE,
                body: contentElm,
                okButtonText: UI.CONFIRM_OK,
                showCancelButton: true,
                cancelButtonText: UI.CONFIRM_CANCEL,
                showCloseButton: false,
                beforeClose: (action) => {
                    if (action === CONFIRM.OK && this._okHandler) {
                        this._okHandler(code);
                    } else if (action !== CONFIRM.OK) {
                        this.start();
                    }
                },
            };

            let resultDialog;
            if (this.isMobile) {
                resultDialog = await kintone.mobile.createBottomSheet(params);
            } else {
                resultDialog = await kintone.createDialog(params);
            }

            await resultDialog.show();
        }

        /**
         * kintone通知でメッセージを表示する(インスタンスのisMobileを使用)。
         * @param {string} text
         */
        _showNotification(text) {
            CodeReaderBase.showNotification(text, this.isMobile);
        }

        /**
         * kintone通知でメッセージを表示する(静的メソッド・外部からも使用可)。
         * 呼び出し元はすべてエラー系メッセージのため、typeは'ERROR'固定とする。
         * @param {string}  text
         * @param {boolean} isMobile
         */
        static showNotification(text, isMobile) {
            if (isMobile) {
                kintone.mobile.showNotification('ERROR', text);
            } else {
                kintone.showNotification('ERROR', text);
            }
        }
    }

    CONST.CodeReaderBase = CodeReaderBase;
})(window);
