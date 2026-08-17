// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : エントリポイント(Main.js)
//     Description : 時間主導型トリガーから呼び出す関数、およびトリガーのセットアップ関数。
// ======================================================================

'use strict';

const DEFAULT_TRIGGER_INTERVAL_MINUTES = 5;

/**
 * 時間主導型トリガーのエントリポイント。
 * Apps Scriptエディタの「トリガー」設定、または setupTrigger() から呼び出される。
 */
function runReminderCheck() {
    const config = loadConfig();
    const summary = processReminders(config);
    Logger.log(
        `リマインドチェック完了: 対象${summary.processed}件 / 成功${summary.succeeded}件 / 失敗${summary.failed}件`,
    );
}

/**
 * runReminderCheckの時間主導型トリガーを作成する(初回セットアップ用)。
 * 既存の同名トリガーは重複作成を避けるため一度削除してから作成し直す。
 * @param {number} [intervalMinutes] - 実行間隔(分)。省略時は既定値(5分)。
 */
function setupTrigger(intervalMinutes) {
    removeTriggers();

    ScriptApp.newTrigger('runReminderCheck')
        .timeBased()
        .everyMinutes(intervalMinutes || DEFAULT_TRIGGER_INTERVAL_MINUTES)
        .create();
}

/** runReminderCheckに紐づく既存のトリガーをすべて削除する */
function removeTriggers() {
    ScriptApp.getProjectTriggers()
        .filter((trigger) => trigger.getHandlerFunction() === 'runReminderCheck')
        .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}
