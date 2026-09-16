// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :フィールドコードを固定値化
//                                                (kintone側スクリプトのFIELDと一致させる)
//  V1.2.0     2026/09/13        J.Yamamoto      :1レコード1タイミングだった送信予定日時を、
//                                                ReminderSchedulesテーブルによる複数タイミング
//                                                対応へ変更(SCHEDULESキーを追加)
//  V1.3.0     2026/09/16        J.Yamamoto      :認証失敗等、個々の行に紐付かない
//                                                システム全体のエラーを管理者へメール通知
//                                                できるよう、任意のADMIN_NOTIFY_EMAILを
//                                                読み込むように追加(Mailer.jsのnotifyAdmin
//                                                OnFailureが使用)。未設定でも動作する
// ----------------------------------------------------------------------
//     ModuleName  : 設定読み込み(Config.js)
//     Description : スクリプトプロパティ(PropertiesService)から機密情報を読み込む。
//                   フィールドコードは対象アプリで固定のため定数として直接定義する
//                   (kintone側 src/desktop.js の FIELD と一致させること)。
// ======================================================================

'use strict';

/** 対象アプリのフィールドコード(固定)。kintone側 src/desktop.js の FIELD と一致させる */
const FIELD = {
    TITLE: 'TITLE',
    DEADLINE: 'DEADLINE',
    MAIL_SUBJECT: 'MAIL_SUBJECT',
    MAIL_BODY: 'MAIL_BODY',
    RECIPIENTS: 'RECIPIENTS',
    RECIPIENT_CODE: 'RECIPIENT_CODE',
    RECIPIENT_NAME: 'RECIPIENT_NAME',
    RECIPIENT_EMAIL: 'RECIPIENT_EMAIL',
    RECIPIENT_TYPE: 'RECIPIENT_TYPE',
    // REMINDER_SCHEDULESテーブル(1行 = 1つの送信タイミング)の列。
    // フィールドコードはkintone側でアプリ全体を通じて一意なため、
    // クエリやrecord[...]での参照はテーブル名を付けず直接このコードで行う。
    SCHEDULES: 'REMINDER_SCHEDULES',
    DAYS_BEFORE: 'DAYS_BEFORE',
    SEND_TIME: 'SEND_TIME',
    SCHEDULED_AT: 'SCHEDULED_SEND_AT',
    SEND_STATUS: 'SEND_STATUS',
    SEND_REQUEST: 'SEND_REQUEST',
    SENT_AT: 'SENT_AT',
    ERROR_MESSAGE: 'ERROR_MESSAGE',
    SEND_COUNT: 'SEND_COUNT',
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
        // 任意設定。システム全体に影響するエラー(認証失敗等)の通知先。
        // 未設定でも動作するが、その場合はGASの実行ログでしか気付けなくなる。
        adminNotifyEmail: props.ADMIN_NOTIFY_EMAIL || '',
        fields: FIELD,
    };
}
