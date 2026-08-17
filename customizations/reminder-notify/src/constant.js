// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/08/17        J.Yamamoto      :プラグインからカスタマイズへ変更、
//                                                フィールドコードを固定値化
// ----------------------------------------------------------------------
//     ModuleName  : 定数定義(constant.js)
//     Description : カスタマイズ全体で共有する定数・名前空間の定義。
//                   本カスタマイズは対象アプリのフィールドコードが固定である前提で
//                   実装する。フィールドコードの一覧は CLAUDE.md / README.md を参照。
// ======================================================================

((global) => {
    'use strict';

    /**
     * カスタマイズ共通の名前空間。
     * ファイル間で共有する定数・関数はすべてこの配下に定義し、
     * 生のグローバル変数を作らない。
     */
    const ReminderNotify = {
        /** 対象アプリのフィールドコード(固定)。アプリ側はこのコードに合わせて作成する */
        FIELD: {
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
        },

        /** ステータスフィールドに設定する文言(固定値) */
        STATUS: {
            UNSENT: '未送信',
            PROCESSING: '送信処理中',
            SENT: '送信済み',
            ERROR: 'エラー',
            STOPPED: '停止',
        },

        /** 即時送信リクエスト(チェックボックス等)に設定する値 */
        SEND_REQUEST_VALUE: '即時送信',

        /** UIに表示するテキスト */
        UI: {
            SEND_NOW_BUTTON: '今すぐメール送信',
            RESEND_BUTTON: '送信済みメールを再送',
            SENDING_LABEL: '送信要求を登録中...',
            CONFIRM_TITLE: '送信確認',
            CONFIRM_DESC_PREFIX: '次の送信先へメール送信を要求します。',
            CONFIRM_OK: '送信要求を登録する',
            CONFIRM_CANCEL: 'キャンセル',
            NOTIFY_SUCCESS:
                'メール送信要求を登録しました。GASの次回定期実行時に送信されます。',
            NOTIFY_NO_RECIPIENTS: '送信先が登録されていません。',
        },

        /** エラーメッセージ */
        MSGS: {
            INVALID_DAYS_BEFORE: '「何日前に送るか」には0以上の整数を入力してください。',
            NO_RECIPIENTS: '送信先を1件以上登録してください。',
            PROCESSING_LOCKED: '現在メール送信処理中のため、編集できません。',
            SEND_REQUEST_FAILED: '送信要求の登録に失敗しました。',
        },

        BUTTON_ID: 'reminder-notify-immediate-send-button',
    };

    global.ReminderNotify = ReminderNotify;
})(window);
