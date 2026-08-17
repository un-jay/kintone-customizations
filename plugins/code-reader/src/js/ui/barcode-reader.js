// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : バーコードリーダー(barcode-reader.js)
//     Description : CODE39バーコード読み取りクラス
//                   Quagga2で連続フレームを解析し、同一コードを規定回数検出した時点で確定する。
// ======================================================================

((global) => {
    'use strict';

    const CONST = global.CodeReaderPlugin;
    const CodeReaderBase = CONST.CodeReaderBase;

    class BarcodeReader extends CodeReaderBase {
        _getCameraTitle() {
            return CONST.UI.CAMERA_TITLE_BARCODE;
        }

        _initializeState() {
            super._initializeState();
            this.quaggaInitialized = false;
            this.lastDetectedCode = null;
            this.detectionCount = 0;
        }

        _startScanning() {
            this._initQuagga();
        }

        _stopScanning() {
            if (this.quaggaInitialized && typeof Quagga !== 'undefined') {
                Quagga.stop();
                this.quaggaInitialized = false;
            }
            this.lastDetectedCode = null;
            this.detectionCount = 0;
        }

        _initQuagga() {
            if (typeof Quagga === 'undefined') {
                console.warn(CONST.MSGS.NOT_QUAGGA_WARN);
                return;
            }

            const CFG = CONST.BARCODE;

            try {
                Quagga.init(
                    {
                        inputStream: {
                            name: 'Live',
                            type: 'LiveStream',
                            target: this.video,
                            constraints: { facingMode: CONST.CAMERA.FACING_MODE },
                        },
                        decoder: {
                            readers: [CFG.READER_TYPE],
                            multiple: false,
                        },
                        locate: true,
                        locator: {
                            patchSize: CFG.PATCH_SIZE,
                            halfSample: CFG.HALF_SAMPLE,
                        },
                        frequency: CFG.FREQUENCY,
                    },
                    (err) => {
                        if (err) {
                            console.error(CONST.MSGS.QUAGGA_INIT_WARN, err);
                            return;
                        }
                        Quagga.onDetected(this._onBarcodeDetected.bind(this));
                        Quagga.start();
                        this.quaggaInitialized = true;
                    },
                );
            } catch (err) {
                console.error(CONST.MSGS.QUAGGA_INIT_WARN, err);
            }
        }

        /**
         * @param {Object} result - Quagga2の検出結果
         */
        _onBarcodeDetected(result) {
            if (!this.reading) {
                return;
            }

            const code = result.codeResult.code;

            if (!this.lastDetectedCode) {
                this.lastDetectedCode = code;
                this.detectionCount = 1;
                return;
            }

            if (this.lastDetectedCode === code) {
                this.detectionCount++;
                if (this.detectionCount >= CONST.BARCODE.DETECTION_COUNT) {
                    this._showResult(code);
                    this.lastDetectedCode = null;
                    this.detectionCount = 0;
                }
            } else {
                this.lastDetectedCode = code;
                this.detectionCount = 1;
            }
        }
    }

    CONST.BarcodeReader = BarcodeReader;
})(window);
