// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : 設定読み込み(Config.js)
//     Description : スクリプトプロパティ(PropertiesService)から機密情報を読み込む。
// ======================================================================

'use strict';

/**
 * スクリプトプロパティから機密情報を読み込む。
 * @returns {Object} 設定値一式
 */
function loadConfig() {
    const props = PropertiesService.getScriptProperties().getProperties();

    const requiredKeys = ['AZURE_VISION_ENDPOINT', 'AZURE_VISION_KEY', 'SHARED_SECRET'];
    const missingKeys = requiredKeys.filter((key) => !props[key]);
    if (missingKeys.length > 0) {
        throw new Error(
            `スクリプトプロパティが未設定です: ${missingKeys.join(', ')}。gas/README.mdを参照してください。`,
        );
    }

    return {
        // 例: https://xxxxx.cognitiveservices.azure.com (末尾のスラッシュは無し)
        azureEndpoint: props.AZURE_VISION_ENDPOINT.replace(/\/$/, ''),
        azureKey: props.AZURE_VISION_KEY,
        // kintone側desktop.jsのGAS_SHARED_SECRETと同じ値にすること
        sharedSecret: props.SHARED_SECRET,
    };
}
