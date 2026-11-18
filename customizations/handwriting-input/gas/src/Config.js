// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/11/18        J.Yamamoto      :Gemini APIの設定(GEMINI_API_KEY/GEMINI_MODEL)へ変更
// ----------------------------------------------------------------------
//     ModuleName  : 設定読み込み(Config.js)
//     Description : スクリプトプロパティ(PropertiesService)から機密情報を読み込む。
// ======================================================================

'use strict';

/** GEMINI_MODELが未設定の場合に使うデフォルトモデル名。
 * 「-latest」は常に最新の世代を指すエイリアスで、モデルの廃止による
 * 手動の書き換えが起きにくい(meter-readerで2.5系の廃止を経験したため)。
 * 混雑でエラーが続く場合は、スクリプトプロパティGEMINI_MODELに
 * gemini-flash-lite-latest等を設定して切り替える(再デプロイ不要)。 */
const GEMINI_DEFAULT_MODEL = 'gemini-flash-latest';

/**
 * スクリプトプロパティから機密情報を読み込む。
 * @returns {Object} 設定値一式
 */
function loadConfig() {
    const props = PropertiesService.getScriptProperties().getProperties();

    const requiredKeys = ['GEMINI_API_KEY', 'SHARED_SECRET'];
    const missingKeys = requiredKeys.filter((key) => !props[key]);
    if (missingKeys.length > 0) {
        throw new Error(
            `スクリプトプロパティが未設定です: ${missingKeys.join(', ')}。gas/README.mdを参照してください。`,
        );
    }

    return {
        geminiApiKey: props.GEMINI_API_KEY,
        geminiModel: props.GEMINI_MODEL || GEMINI_DEFAULT_MODEL,
        // kintone側desktop.jsのGAS_SHARED_SECRETと同じ値にすること
        sharedSecret: props.SHARED_SECRET,
    };
}
