// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/01        J.Yamamoto      :renderTemplate/extractRecipientsByTypeを
//                                                Vitestからテストできるよう、GAS実行時には
//                                                影響しないCommonJS export
//                                                (module存在チェック付き)を末尾に追加
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
 * レコードの送信先テーブルから、TO/CC/BCC区分ごとにメールアドレスを振り分ける。
 * 送信区分が未設定・不明な値の行はTO扱いにする。
 * @param {Object} config
 * @param {Object} record
 * @returns {{to: string[], cc: string[], bcc: string[]}}
 */
function extractRecipientsByType(config, record) {
    const F = config.fields;
    const rows = record[F.RECIPIENTS]?.value || [];
    const recipients = { to: [], cc: [], bcc: [] };

    rows.forEach((row) => {
        const email = row.value[F.RECIPIENT_EMAIL]?.value;
        if (!email) {
            return;
        }
        const rawType = (row.value[F.RECIPIENT_TYPE]?.value || '').toUpperCase();
        const category = RECIPIENT_TYPE_TO_CATEGORY[rawType] || 'to';
        recipients[category].push(email);
    });

    return recipients;
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

// Vitestからのテスト用に、副作用を持たない関数のみをCommonJS export経由で公開する。
// GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderTemplate, extractRecipientsByType };
}
