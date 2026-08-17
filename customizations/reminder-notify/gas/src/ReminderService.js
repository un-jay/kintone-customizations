// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : リマインド送信処理(ReminderService.js)
//     Description : 対象レコードの抽出→送信→結果書き戻しを行う業務ロジック。
//                   抽出・更新はKintoneClient.js、送信はMailer.jsに委譲する。
// ======================================================================

'use strict';

/**
 * 送信対象レコードをすべて処理する。
 * @param {Object} config - loadConfig()の戻り値
 * @returns {{processed: number, succeeded: number, failed: number}} 処理件数のサマリー
 */
function processReminders(config) {
    const nowIso = new Date().toISOString();
    const targetRecords = fetchTargetRecords(config, nowIso);

    let succeeded = 0;
    let failed = 0;

    targetRecords.forEach((record) => {
        const succeededOne = processSingleRecord(config, record, nowIso);
        if (succeededOne) {
            succeeded++;
        } else {
            failed++;
        }
    });

    return { processed: targetRecords.length, succeeded, failed };
}

/**
 * 1件のレコードを処理する(処理中に更新→送信→結果書き戻し)。
 * @param {Object} config
 * @param {Object} record
 * @param {string} nowIso
 * @returns {boolean} 送信に成功したかどうか
 */
function processSingleRecord(config, record, nowIso) {
    const F = config.fields;
    const recordId = record.$id.value;
    let revision = record.$revision.value;

    try {
        updateRecord(config, recordId, revision, {
            [F.SEND_STATUS]: STATUS.PROCESSING,
        });
        revision = String(Number(revision) + 1);

        sendReminderMail(config, record);

        const nextSendCount = (Number(record[F.SEND_COUNT]?.value) || 0) + 1;
        updateRecord(config, recordId, revision, {
            [F.SEND_STATUS]: STATUS.SENT,
            [F.SENT_AT]: nowIso,
            [F.SEND_COUNT]: String(nextSendCount),
            [F.SEND_REQUEST]: [],
            [F.ERROR_MESSAGE]: '',
        });
        return true;
    } catch (error) {
        Logger.log(`レコードid=${recordId}の送信に失敗しました: ${error.message}`);
        try {
            updateRecord(config, recordId, revision, {
                [F.SEND_STATUS]: STATUS.ERROR,
                [F.ERROR_MESSAGE]: error.message,
            });
        } catch (updateError) {
            Logger.log(
                `レコードid=${recordId}のエラー状態書き戻しにも失敗しました: ${updateError.message}`,
            );
        }
        return false;
    }
}
