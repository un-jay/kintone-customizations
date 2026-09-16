// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/01        J.Yamamoto      :renderTemplate/extractRecipientsByTypeを
//                                                Vitestからテストできるよう、GAS実行時には
//                                                影響しないCommonJS export
//                                                (module存在チェック付き)を末尾に追加
//  V1.2.0     2026/09/13        J.Yamamoto      :メールアドレスの形式チェック(isValidEmail)、
//                                                送信可能残数チェック(validateMailQuota)を追加。
//                                                形式が不正なメールアドレスは黙って無視せず
//                                                エラーにする(気付かず送信されないのを防ぐため)
//  V1.3.0     2026/09/16        J.Yamamoto      :認証失敗・レコード取得失敗等、個々の行に
//                                                紐付かずkintoneのERROR_MESSAGEへ書き戻せない
//                                                システム全体のエラーは、顧客側がGASの実行ログを
//                                                見られないため気付く手段が無かった。
//                                                notifyAdminOnFailureを追加し、
//                                                ADMIN_NOTIFY_EMAIL宛にメール通知するように
//                                                した(未設定の場合は従来通りログのみ)。
//                                                障害が続く間に大量送信されないよう、
//                                                最短間隔(60分)を空けて送る
// ----------------------------------------------------------------------
//     ModuleName  : メール送信処理(Mailer.js)
//     Description : MailAppによるメール送信と、件名/本文のプレースホルダ置換を行う。
// ======================================================================

'use strict';

/**
 * テンプレート文字列内の {{フィールドコード}} を、レコードの値へ置換する。
 * レコードに存在しないフィールドコードはそのまま残す。
 * @param {string} template
 * @param {Object} record - kintoneレコード({フィールドコード: {value: ...}}形式)
 * @returns {string}
 */
function renderTemplate(template, record) {
    return template.replace(/\{\{(\w+)\}\}/g, (matched, fieldCode) => {
        const field = record[fieldCode];
        if (!field || field.value === null || field.value === undefined) {
            return matched;
        }
        return String(field.value);
    });
}

/** 送信先区分フィールドの値とMailAppの宛先区分の対応 */
const RECIPIENT_TYPE_TO_CATEGORY = {
    TO: 'to',
    CC: 'cc',
    BCC: 'bcc',
};

/**
 * メールアドレスの形式を簡易チェックする。
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * レコードの送信先テーブルから、TO/CC/BCC区分ごとにメールアドレスを振り分ける。
 * 送信区分が未設定・不明な値の行はTO扱いにする。
 * メールアドレスの形式が不正な行があれば、黙って無視せずエラーにする
 * (気付かないまま送信対象から漏れるのを防ぐため)。
 * @param {Object} config
 * @param {Object} record
 * @returns {{to: string[], cc: string[], bcc: string[]}}
 */
function extractRecipientsByType(config, record) {
    const F = config.fields;
    const rows = record[F.RECIPIENTS]?.value || [];
    const recipients = { to: [], cc: [], bcc: [] };
    const invalidEmails = [];

    rows.forEach((row) => {
        const email = row.value[F.RECIPIENT_EMAIL]?.value;
        if (!email) {
            return;
        }
        if (!isValidEmail(email)) {
            invalidEmails.push(email);
            return;
        }
        const rawType = (row.value[F.RECIPIENT_TYPE]?.value || '').toUpperCase();
        const category = RECIPIENT_TYPE_TO_CATEGORY[rawType] || 'to';
        recipients[category].push(email);
    });

    if (invalidEmails.length > 0) {
        throw new Error(
            `メールアドレスの形式が不正な送信先があります: ${invalidEmails.join(', ')}`,
        );
    }

    return recipients;
}

/**
 * 送信に必要な件数分の、本日のメール送信可能残数があるかを確認する。
 * @param {{to: string[], cc: string[], bcc: string[]}} recipients
 */
function validateMailQuota(recipients) {
    const requiredCount =
        recipients.to.length + recipients.cc.length + recipients.bcc.length;
    const remainingCount = MailApp.getRemainingDailyQuota();

    if (remainingCount < requiredCount) {
        throw new Error(
            `本日のメール送信可能数が不足しています(必要:${requiredCount}、残り:${remainingCount})。`,
        );
    }
}

/**
 * リマインドメールを送信する。
 * @param {Object} config
 * @param {Object} record
 */
function sendReminderMail(config, record) {
    const F = config.fields;
    const recipients = extractRecipientsByType(config, record);

    if (recipients.to.length === 0) {
        throw new Error('送信区分「TO」の送信先メールアドレスが登録されていません。');
    }

    validateMailQuota(recipients);

    const subject = renderTemplate(record[F.MAIL_SUBJECT]?.value || '', record);
    const body = renderTemplate(record[F.MAIL_BODY]?.value || '', record);

    MailApp.sendEmail({
        to: recipients.to.join(','),
        cc: recipients.cc.join(','),
        bcc: recipients.bcc.join(','),
        subject,
        body,
    });
}

/** 管理者通知メールを再送するまでの最短間隔(分)。同じ障害が続く間、
 * トリガー実行(既定5分おき)のたびに送るとメールが埋もれてしまうのを防ぐ。 */
const ADMIN_ALERT_MIN_INTERVAL_MINUTES = 60;

/** 前回の管理者通知メール送信日時(ミリ秒)を記録するスクリプトプロパティ名 */
const LAST_ADMIN_ALERT_PROPERTY = 'LAST_ADMIN_ALERT_AT';

/**
 * システム全体に影響するエラー(kintoneへの認証失敗・レコード取得失敗等、
 * 個々の行に紐付かずERROR_MESSAGEへ書き戻せない種類の失敗)を、管理者へ
 * メールで通知する。顧客側はGASの実行ログを見られないことが多いため、
 * この通知が唯一気付ける手段になる。
 *
 * ADMIN_NOTIFY_EMAILが未設定の場合は何もしない(従来通りGASの実行ログにのみ記録される)。
 * 同じ障害が続く間、トリガー実行のたびに大量送信されないよう
 * ADMIN_ALERT_MIN_INTERVAL_MINUTES未満の間隔では再送しない。
 * 通知自体が失敗しても、呼び出し元の処理をさらに止めないよう例外は投げない。
 * @param {Object|null} config  - loadConfig()の戻り値(nullの場合は設定読み込み自体が失敗)
 * @param {string}      context - 発生箇所の説明(例: "リマインドチェック処理")
 * @param {Error}       error
 */
function notifyAdminOnFailure(config, context, error) {
    const adminEmail = config && config.adminNotifyEmail;
    if (!adminEmail) {
        Logger.log(
            'ADMIN_NOTIFY_EMAIL未設定のため、管理者への通知メールは送信されません' +
                '(GASの実行ログにのみ記録されます)。',
        );
        return;
    }

    try {
        const props = PropertiesService.getScriptProperties();
        const lastAlertAt = Number(props.getProperty(LAST_ADMIN_ALERT_PROPERTY)) || 0;
        const elapsedMinutes = (Date.now() - lastAlertAt) / 60000;
        if (elapsedMinutes < ADMIN_ALERT_MIN_INTERVAL_MINUTES) {
            Logger.log(
                `直近${ADMIN_ALERT_MIN_INTERVAL_MINUTES}分以内に通知済みのため、` +
                    '今回の管理者通知メールは送信をスキップしました。',
            );
            return;
        }

        const timestamp = Utilities.formatDate(
            new Date(),
            'Asia/Tokyo',
            'yyyy/MM/dd HH:mm:ss',
        );
        MailApp.sendEmail({
            to: adminEmail,
            subject: '【要確認】kintoneリマインドメール送信でエラーが発生しました',
            body:
                `${context}でエラーが発生し、処理を継続できませんでした。\n\n` +
                `発生日時: ${timestamp}\n` +
                `内容: ${(error && error.message) || String(error)}\n\n` +
                '同じエラーが続く場合、このメールはしばらく再送されません。\n' +
                '内容を確認のうえ、対応が難しい場合は導入時の担当者へご連絡ください。',
        });
        props.setProperty(LAST_ADMIN_ALERT_PROPERTY, String(Date.now()));
    } catch (mailError) {
        Logger.log(`管理者への通知メール送信にも失敗しました: ${mailError.message}`);
    }
}

// Vitestからのテスト用に、副作用を持たない関数のみをCommonJS export経由で公開する。
// GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderTemplate, extractRecipientsByType, isValidEmail };
}
