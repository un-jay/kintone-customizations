// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/28        J.Yamamoto      :実機確認で「503(高負荷による一時的な
//                                                利用不可)」が発生したため、503/429の
//                                                場合のみ数秒空けて最大3回まで自動リトライ
//                                                する処理を追加
// ----------------------------------------------------------------------
//     ModuleName  : Gemini APIクライアント(GeminiVisionClient.js)
//     Description : Google Gemini API(マルチモーダルモデル)のgenerateContentを
//                   呼び出し、アナログ針メーター・デジタル表示メーターの写真から
//                   数値を読み取る。構造化出力(responseSchema)を使い、
//                   {meterType, value, unit, confidence, rawLabel}の
//                   JSON形式で結果を受け取る。
//                   【要検証】エンドポイント・リクエスト形式は、このセッションで
//                   ai.google.dev(公式ドキュメント)への直接アクセスができない
//                   状態で実装したものであり、導入前に必ず最新の公式ドキュメント
//                   (https://ai.google.dev/gemini-api/docs)で確認すること。
// ======================================================================

'use strict';

/** Generative Language API(Gemini API)のベースURL */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * メーター読み取りをGeminiへ指示するプロンプト。
 * アナログ針メーター・デジタル表示メーターの両方を1つのプロンプトで扱う。
 */
const METER_PROMPT = [
    'あなたは工場の計測機器(メーター)の写真から数値を読み取る専門家です。',
    '添付された画像には、アナログ式(指針・目盛り)またはデジタル式(数字表示)の',
    '計測機器が1つ写っています。次の手順で読み取ってください。',
    '',
    '1. 計器の種類を判定する',
    '   ("analog": 指針と目盛りで示すタイプ、"digital": 数字をそのまま表示する',
    '   タイプ、"unknown": 計器が写っていない・種類を判別できない)',
    '2. アナログ式の場合は、目盛りの最小値・最大値・間隔と、指針が指している',
    '   位置から数値を推定する。目盛りに数字が書かれている場合はそれを優先する',
    '3. デジタル式の場合は、表示されている数字をそのまま読み取る',
    '   (小数点があれば含める)',
    '4. 単位(例: MPa, kg, ℃, kWh, rpm, L/min)が計器上に表示されていれば',
    '   読み取り、無ければ空文字("")にする',
    '5. 読み取りの自信度を"high"(はっきり読み取れた)/"medium"(判読しにくい',
    '   部分があった)/"low"(反射・ピンボケ・指針が目盛りの境界上にある等で',
    '   不確か)の3段階で判定する',
    '6. 判断の根拠(目盛りの範囲、指針の位置、表示文字列など)を1文の日本語で',
    '   簡潔に説明する(rawLabel)',
    '',
    '計器が写っていない、または全く読み取れない場合は、meterTypeを"unknown"、',
    'valueをnullにしてください。数値以外の情報しか読み取れない場合も、',
    'meterTypeを"unknown"としてください。',
].join('\n');

/** Geminiの構造化出力(responseSchema)。generateContentのgenerationConfigに指定する。 */
const METER_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        meterType: { type: 'STRING', enum: ['analog', 'digital', 'unknown'] },
        value: { type: 'NUMBER', nullable: true },
        unit: { type: 'STRING' },
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        rawLabel: { type: 'STRING' },
    },
    required: ['meterType', 'value', 'unit', 'confidence', 'rawLabel'],
};

/** リトライする最大試行回数(1回目 + 自動リトライ2回 = 最大3回) */
const MAX_ATTEMPTS = 3;

/** リトライ前に待つ時間(ミリ秒)の基準値。試行回数に応じて線形に延ばす(2秒・4秒)。 */
const RETRY_BASE_DELAY_MS = 2000;

/**
 * 自動リトライの対象とするHTTPステータスコードかどうかを判定する。
 * 503(UNAVAILABLE: 一時的な高負荷)・429(RESOURCE_EXHAUSTED: レート制限)は、
 * 実機確認で発生を確認済みで、いずれも時間を置けば解消しうる一時的なエラーのため対象とする。
 * それ以外(400/404等、リクエスト自体が誤っている場合)はリトライしても解決しないため対象外。
 * @param {number} statusCode
 * @returns {boolean}
 */
function isRetryableStatusCode(statusCode) {
    return statusCode === 503 || statusCode === 429;
}

/**
 * 画像(Base64文字列)をGemini APIへ送り、メーターの読み取り結果を取得する。
 * 503/429の場合のみ、数秒空けて最大MAX_ATTEMPTS回まで自動リトライする。
 * @param {Object} config      - loadConfig()の戻り値
 * @param {string} base64Image - JPEG画像のBase64文字列(data URLのプレフィックスは含まない)
 * @returns {{meterType: string, value: (number|null), unit: string, confidence: string, rawLabel: string}}
 */
function readMeterFromImage(config, base64Image) {
    const url = `${GEMINI_API_BASE}/models/${config.geminiModel}:generateContent`;
    const payload = {
        contents: [
            {
                parts: [
                    { text: METER_PROMPT },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                ],
            },
        ],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: METER_RESPONSE_SCHEMA,
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

    const body = JSON.parse(response.getContentText());
    return extractMeterResultFromResponse(body);
}

/**
 * generateContentのレスポンスから、構造化出力(JSON文字列)を取り出して正規化する。
 * candidates[0].content.parts[].textにJSON文字列が入る(responseMimeType:
 * "application/json"を指定しているため、Markdownのコードフェンス等は付かない)。
 * @param {Object} response - generateContentのレスポンスをパースしたオブジェクト
 * @returns {{meterType: string, value: (number|null), unit: string, confidence: string, rawLabel: string}}
 */
function extractMeterResultFromResponse(response) {
    const candidates = (response && response.candidates) || [];
    const parts =
        (candidates[0] && candidates[0].content && candidates[0].content.parts) || [];
    const textPart = parts.find((part) => part && typeof part.text === 'string');
    if (!textPart) {
        throw new Error('Gemini APIのレスポンスにテキストが含まれていません。');
    }

    const result = JSON.parse(textPart.text);
    return {
        meterType: result.meterType || 'unknown',
        value: typeof result.value === 'number' ? result.value : null,
        unit: result.unit || '',
        confidence: result.confidence || 'low',
        rawLabel: result.rawLabel || '',
    };
}

// Vitestからのテスト用に、副作用を持たない純粋関数のみをCommonJS export経由で公開する。
// GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        extractMeterResultFromResponse,
        isRetryableStatusCode,
        METER_RESPONSE_SCHEMA,
    };
}
