// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : Azure AI Visionクライアント(AzureOcrClient.js)
//     Description : Azure AI Vision(Image Analysis 4.0)のRead機能を呼び出し、
//                   手書き文字を含む画像からテキストを抽出する。
//                   参照: https://learn.microsoft.com/azure/ai-services/computer-vision/how-to/call-analyze-image-40
// ======================================================================

'use strict';

/** Image Analysis 4.0 APIのバージョン */
const AZURE_API_VERSION = '2024-02-01';

/**
 * 画像(Blob)をAzure AI Vision(Read機能)へ送り、認識したテキストを行単位でつなげて返す。
 * @param {Object} config - loadConfig()の戻り値
 * @param {Blob}   imageBlob
 * @returns {string} 認識したテキスト(複数行はLF区切り)
 */
function recognizeHandwriting(config, imageBlob) {
    const url =
        `${config.azureEndpoint}/computervision/imageanalysis:analyze` +
        `?api-version=${AZURE_API_VERSION}&features=read&language=ja`;

    const response = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/octet-stream',
        headers: { 'Ocp-Apim-Subscription-Key': config.azureKey },
        payload: imageBlob,
        muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
        throw new Error(
            `Azure AI Visionの呼び出しに失敗しました: ${response.getContentText()}`,
        );
    }

    const body = JSON.parse(response.getContentText());
    return extractTextFromReadResult(body);
}

/**
 * Image Analysis 4.0のレスポンス(readResult)から、行のテキストを上から順につなげる。
 * readResult.blocks[].lines[].text の構造(公式リファレンスのサンプルレスポンスを参照)。
 * @param {Object} readResponse - Analyze APIのレスポンスをパースしたオブジェクト
 * @returns {string} LF区切りのテキスト(該当行が無い場合は空文字)
 */
function extractTextFromReadResult(readResponse) {
    const blocks =
        (readResponse && readResponse.readResult && readResponse.readResult.blocks) || [];
    const lines = [];
    blocks.forEach((block) => {
        (block.lines || []).forEach((line) => {
            if (line && line.text) {
                lines.push(line.text);
            }
        });
    });
    return lines.join('\n');
}

// Vitestからのテスト用に、副作用を持たないextractTextFromReadResultのみをCommonJS export
// 経由で公開する。GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractTextFromReadResult };
}
