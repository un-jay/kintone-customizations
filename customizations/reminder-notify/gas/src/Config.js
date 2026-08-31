// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :フィールドコードを固定値化
//                                                (kintone側スクリプトのFIELDと一致させる)
// ----------------------------------------------------------------------
//     ModuleName  : 設定読み込み(Config.js)
//     Description : スクリプトプロパティ(PropertiesService)から機密情報を読み込む。
//                   フィールドコードは対象アプリで固定のため定数として直接定義する
//                   (kintone側 src/desktop.js の FIELD と一致させること)。
// ======================================================================

'use strict';

/** 対象アプリのフィールドコード(固定)。kintone側 src/desktop.js の FIELD と一致させる */
const FIELD = {
    TITLE: 'Title',
    DEADLINE: 'Deadline',
    DAYS_BEFORE: 'DaysBefore',
    SEND_TIME: 'SendTime',
    SCHEDULED_AT: 'ScheduledSendAt',
    MAIL_SUBJECT: 'MailSubject',
    MAIL_BODY: 'MailBody',
    SEND_STATUS: 'SendStatus',
    SEND_REQUEST: 'SendRequest',
    SENT_AT: 'SentAt',
    ERROR_MESSAGE: 'ErrorMessage',
    SEND_COUNT: 'SendCount',
    RECIPIENTS: 'Recipients',
    RECIPIENT_CODE: 'RecipientCode',
    RECIPIENT_NAME: 'RecipientName',
    RECIPIENT_EMAIL: 'RecipientEmail',
    RECIPIENT_TYPE: 'RecipientType',
};

/** kintone側 src/desktop.js の STATUS と一致させる固定値 */
const STATUS = {
    UNSENT: '未送信',
    PROCESSING: '送信処理中',
    SENT: '送信済み',
    ERROR: 'エラー',
    STOPPED: '停止',
};

const SEND_REQUEST_VALUE = '即時送信';

/** 1回のGETで取得できる最大件数(kintone REST APIの上限) */
const RECORDS_PER_REQUEST = 500;

/**
 * スクリプトプロパティから機密情報を読み込む。
 * フィールドコードは固定値のため、スクリプトプロパティには含めない。
 * @returns {Object} 設定値一式
 */
function loadConfig() {
    const props = PropertiesService.getScriptProperties().getProperties();

    const requiredKeys = ['KINTONE_SUBDOMAIN', 'KINTONE_API_TOKEN', 'KINTONE_APP_ID'];
    const missingKeys = requiredKeys.filter((key) => !props[key]);
    if (missingKeys.length > 0) {
        throw new Error(
            `スクリプトプロパティが未設定です: ${missingKeys.join(', ')}。gas/README.mdを参照してください。`,
        );
    }

    return {
        subdomain: props.KINTONE_SUBDOMAIN,
        apiToken: props.KINTONE_API_TOKEN,
        appId: props.KINTONE_APP_ID,
        fields: FIELD,
    };
}
