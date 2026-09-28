// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/28        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : 設定読み込み(Config.js)
//     Description : スクリプトプロパティ(PropertiesService)から機密情報を読み込む。
// ======================================================================

'use strict';

/** GEMINI_MODELが未設定の場合に使うデフォルトモデル名。
 * 【要検証】このセッションではGemini API公式ドキュメント(ai.google.dev)への
 * ネットワークアクセスができず、最新のモデル名を確認できていない。
 * 導入前に https://ai.google.dev/gemini-api/docs/models で現行のモデル名を
 * 確認し、必要であればスクリプトプロパティGEMINI_MODELで上書きすること。 */
const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

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
