// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/13        J.Yamamoto      :LockServiceによる多重実行防止を追加。
//                                                処理が長引いてトリガー間隔と重なった場合の
//                                                二重送信を防ぐ
// ----------------------------------------------------------------------
//     ModuleName  : エントリポイント(Main.js)
//     Description : 時間主導型トリガーから呼び出す関数、およびトリガーのセットアップ関数。
// ======================================================================

'use strict';

const DEFAULT_TRIGGER_INTERVAL_MINUTES = 5;

/** ロック取得待ちの最大時間(ミリ秒) */
const LOCK_WAIT_MS = 1000;

/**
 * 時間主導型トリガーのエントリポイント。
 * Apps Scriptエディタの「トリガー」設定、または setupTrigger() から呼び出される。
 * LockServiceで多重実行を防ぐ(処理が長引いて次のトリガーと重なった場合、
 * 後から来た実行は何もせず終了する)。
 */
function runReminderCheck() {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
        Logger.log('別のリマインド処理が実行中のため、今回の実行はスキップしました。');
        return;
    }

    try {
        const config = loadConfig();
        const summary = processReminders(config);
        Logger.log(
            `リマインドチェック完了: 対象${summary.processed}件 / 成功${summary.succeeded}件 / 失敗${summary.failed}件`,
        );
    } finally {
        lock.releaseLock();
    }
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
