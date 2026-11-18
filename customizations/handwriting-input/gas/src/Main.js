// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/11/18        J.Yamamoto      :Gemini API呼び出しへ変更(画像サイズ上限を10MBへ変更)
// ----------------------------------------------------------------------
//     ModuleName  : エントリポイント(Main.js)
//                   Gemini APIキーをブラウザ側に渡さず、GAS側で保持したまま
//                   Gemini APIへ中継する(GeminiOcrClient.jsに委譲)。
// ======================================================================

'use strict';

/** Geminiへ送る画像の許容サイズ上限(バイト)。リクエスト全体(Base64化で約1.33倍)が
 * インライン送信の上限(20MB)に収まるよう、安全側に10MBとし、明確なエラーメッセージを
 * 返すため早期にチェックする。【要確認】上限値はGemini API公式ドキュメントで確認すること。
 * kintone側で長辺1600pxへ縮小してから送るため、通常はこの上限を大きく下回る。 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Web AppのPOSTエントリポイント。kintone側desktop.jsから呼び出される。
 *
 * 【重要】GAS Web AppはdoPostで任意のHTTPステータスコードを返せない(常に200)。
 * そのため成功/失敗はレスポンスJSONの`ok`フィールドで表現する。
 *
 * 【重要】ブラウザ側でのCORSプリフライトを避けるため、呼び出し元は
 * Content-Type: text/plain で送ってくる想定(実体はJSON文字列)。
 * @param {Object} e - Apps Scriptのイベントオブジェクト
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
    try {
        const config = loadConfig();
        const request = parseRequestBody(e);

        if (request.sharedSecret !== config.sharedSecret) {
            return jsonOutput({ ok: false, error: '認証に失敗しました。' });
        }
        if (!request.imageBase64) {
            return jsonOutput({ ok: false, error: '画像データがありません。' });
        }

        const imageBytes = Utilities.base64Decode(request.imageBase64);
        if (imageBytes.length > MAX_IMAGE_BYTES) {
            return jsonOutput({
                ok: false,
                error: `画像サイズが大きすぎます(上限${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB)。`,
            });
        }

        const text = recognizeHandwriting(config, request.imageBase64);
        return jsonOutput({ ok: true, text });
    } catch (error) {
        Logger.log(
            `手書き文字認識でエラーが発生しました: ${error.stack || error.message}`,
        );
        return jsonOutput({ ok: false, error: error.message });
    }
}

/**
 * リクエストボディをJSONとしてパースする。
 * Content-Type: text/plain で送られてくる想定のため、e.postData.contentsを
 * そのままJSON.parseする(kintone側desktop.jsのcallHandwritingOcr参照)。
 * @param {Object} e
 * @returns {{sharedSecret: string, imageBase64: string}}
 */
function parseRequestBody(e) {
    if (!e || !e.postData || !e.postData.contents) {
        throw new Error('リクエストの本文がありません。');
    }
    return JSON.parse(e.postData.contents);
}

/**
 * JSONレスポンスを組み立てる。
 * @param {Object} obj
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonOutput(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
        ContentService.MimeType.JSON,
    );
}
