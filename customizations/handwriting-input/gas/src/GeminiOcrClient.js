// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/11/18        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : Gemini APIクライアント(GeminiOcrClient.js)
//     Description : Google Gemini API(マルチモーダルモデル)のgenerateContentを
//                   呼び出し、手書き文字を含む画像からテキストを書き起こす。
//                   カード登録不要で使えるGemini APIを採用している。
//                   503/429(一時的な高負荷・レート制限)の場合のみ自動リトライする
//                   (meter-readerのGeminiVisionClient.jsと同じ方針)。
// ======================================================================

'use strict';

/** Generative Language API(Gemini API)のベースURL */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** 手書きメモの書き起こしをGeminiへ指示するプロンプト。 */
const OCR_PROMPT = [
    'あなたは日本語の手書き文字を書き起こす専門家です。',
    '添付された画像に書かれている文字(手書き・印刷の両方)を、見えたとおりに書き起こしてください。',
    '',
    '- 内容を要約・訂正・翻訳・補足しない。読み取れた文字だけを出力する',
    '- 画像の上から下、左から右の順に、行ごとに改行して出力する',
    '- 罫線で区切られた表の場合は、1行ずつ左から右へ、セルの内容を全角スペースで区切って出力する',
    '- 空欄のセルや罫線だけの行は出力しない',
    '- 判読できない文字は「?」で表す',
    '- 文字がまったく見当たらない場合は、textを空文字("")にする',
].join('\n');

/** Geminiの構造化出力(responseSchema)。generateContentのgenerationConfigに指定する。 */
const OCR_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        text: { type: 'STRING' },
    },
    required: ['text'],
};

/** リトライする最大試行回数(1回目 + 自動リトライ2回 = 最大3回) */
const MAX_ATTEMPTS = 3;

/** リトライ前に待つ時間(ミリ秒)の基準値。試行回数に応じて線形に延ばす(2秒・4秒)。 */
const RETRY_BASE_DELAY_MS = 2000;

/**
 * 自動リトライの対象とするHTTPステータスコードかどうかを判定する。
 * 503(一時的な高負荷)・429(レート制限)は時間を置けば解消しうるため対象とする。
 * 400/401/404等(リクエストやキー・モデル名が誤っている場合)はリトライしても
 * 解決しないため対象外。
 * @param {number} statusCode
 * @returns {boolean}
 */
function isRetryableStatusCode(statusCode) {
    return statusCode === 503 || statusCode === 429;
}

/**
 * 画像(Base64文字列)をGemini APIへ送り、書き起こしたテキストを返す。
 * @param {Object} config      - loadConfig()の戻り値
 * @param {string} base64Image - JPEG画像のBase64文字列(data URLのプレフィックスは含まない)
 * @returns {string} 認識したテキスト(複数行はLF区切り。文字が無い場合は空文字)
 */
function recognizeHandwriting(config, base64Image) {
    const url = `${GEMINI_API_BASE}/models/${config.geminiModel}:generateContent`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: OCR_PROMPT },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: OCR_RESPONSE_SCHEMA,
            // 書き起こしに推論は不要なため思考を無効化し(応答時間の短縮)、
            // 出力の暴走(同じ文字の繰り返し等)で長時間かかるのを防ぐため出力量に上限を設ける
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 4096,
        },
    };
    const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': config.geminiApiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
    };

    let response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        response = UrlFetchApp.fetch(url, options);
        const statusCode = response.getResponseCode();
        if (statusCode === 200 || !isRetryableStatusCode(statusCode)) {
            break;
        }
        if (attempt < MAX_ATTEMPTS) {
            Utilities.sleep(RETRY_BASE_DELAY_MS * attempt);
        }
    }

    if (response.getResponseCode() !== 200) {
        throw new Error(
            `Gemini APIの呼び出しに失敗しました: ${response.getContentText()}`,
        );
    }

    return extractTextFromGeminiResponse(JSON.parse(response.getContentText()));
}

/**
 * generateContentのレスポンスから、構造化出力(JSON文字列)内のtextを取り出す。
 * candidates[0].content.parts[].textにJSON文字列({"text": "..."})が入る。
 * @param {Object} response - generateContentのレスポンスをパースしたオブジェクト
 * @returns {string} 書き起こしたテキスト(前後の空白は除去。無ければ空文字)
 */
function extractTextFromGeminiResponse(response) {
    const candidates = (response && response.candidates) || [];
    const candidate = candidates[0] || {};
    const parts = (candidate.content && candidate.content.parts) || [];
    const textPart = parts.find((part) => part && typeof part.text === 'string');
    if (!textPart) {
        const reason = candidate.finishReason
            ? `(finishReason: ${candidate.finishReason})`
            : '';
        throw new Error(`Gemini APIのレスポンスにテキストが含まれていません。${reason}`);
    }

    const result = JSON.parse(textPart.text);
    return typeof result.text === 'string' ? result.text.trim() : '';
}

// Vitestからのテスト用に、副作用を持たない純粋関数のみをCommonJS export経由で公開する。
// GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractTextFromGeminiResponse,
        isRetryableStatusCode,
        OCR_RESPONSE_SCHEMA,
    };
}
