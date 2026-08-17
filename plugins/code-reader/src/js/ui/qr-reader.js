// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : QRコードリーダー(qr-reader.js)
//     Description : QRコード読み取りクラス
//                   requestAnimationFrameでビデオフレームを連続解析してQRコードを検出する
//                   (jsQRライブラリを使用)。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.CodeReaderPlugin;
    const CodeReaderBase = CONST.CodeReaderBase;

    class QRReader extends CodeReaderBase {
        _getCameraTitle() {
            return CONST.UI.CAMERA_TITLE_QR;
        }

        _startScanning() {
            if (typeof jsQR === 'undefined') {
                console.warn(CONST.MSGS.NOT_JSQR_WARN);
                return;
            }
            this._readQR();
        }

        /**
         * ビデオフレームをCanvasに描画してjsQRで解析する。
         * QRコード検出まで次フレームで再帰的に実行される。
         */
        _readQR() {
            if (!this.reading || !this.video.videoWidth) {
                return;
            }

            const ctx = this.canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

            let imageData;
            try {
                imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            } catch (err) {
                console.warn(CONST.MSGS.GET_IMAGE_WARN, err.message);
                requestAnimationFrame(this._readQR.bind(this));
                return;
            }

            const code = jsQR(imageData.data, this.canvas.width, this.canvas.height);
            if (code?.data) {
                this._showResult(code.data);
                return;
            }

            requestAnimationFrame(this._readQR.bind(this));
        }
    }

    CONST.QRReader = QRReader;
})(window);
