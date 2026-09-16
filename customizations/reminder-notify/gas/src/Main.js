// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/08/17        J.Yamamoto      :新規作成
//  V1.1.0     2026/09/13        J.Yamamoto      :LockServiceによる多重実行防止を追加。
//                                                処理が長引いてトリガー間隔と重なった場合の
//                                                二重送信を防ぐ
//  V1.2.0     2026/09/16        J.Yamamoto      :設定読み込み・レコード取得失敗等、
//                                                個々の行に紐付かないエラーが起きても
//                                                GASの実行ログにしか残らず、顧客側は
//                                                気付けなかったため、Mailer.jsの
//                                                notifyAdminOnFailureで管理者へメール
//                                                通知するように変更
//  V1.3.0     2026/09/16        J.Yamamoto      :everyMinutes()はトリガー作成時刻からの
//                                                相対間隔のため、セットアップした時刻次第で
//                                                送信が毎時00分/05分等のキリの良い時刻からズレて
//                                                いた。トリガー自体は常に1分間隔で作成し、
//                                                runReminderCheck側でisAlignedMinuteにより
//                                                設定した間隔の倍数の分(00分/05分/10分...)
//                                                でだけ実際に処理するように変更。kintoneへの
//                                                APIリクエスト数は変わらない(実処理の頻度は
//                                                従来通り)
// ----------------------------------------------------------------------
//     ModuleName  : エントリポイント(Main.js)
//     Description : 時間主導型トリガーから呼び出す関数、およびトリガーのセットアップ関数。
// ======================================================================

'use strict';

const DEFAULT_TRIGGER_INTERVAL_MINUTES = 5;

/** 実際の実行間隔(分)を記録するスクリプトプロパティ名 */
const TRIGGER_INTERVAL_PROPERTY = 'TRIGGER_INTERVAL_MINUTES';

/** Apps ScriptのClockTriggerBuilder#everyMinutesが受け付ける値 */
const ALLOWED_TRIGGER_INTERVALS = [1, 5, 10, 15, 30];

/** ロック取得待ちの最大時間(ミリ秒) */
const LOCK_WAIT_MS = 1000;

/**
 * 現在時刻が、指定した実行間隔(分)の「キリの良い時刻」かどうかを判定する。
 * 例: intervalMinutes=5なら、毎時00分/05分/10分/15分...のときだけtrueを返す。
 * @param {Date}   now
 * @param {number} intervalMinutes
 * @returns {boolean}
 */
function isAlignedMinute(now, intervalMinutes) {
    return now.getMinutes() % intervalMinutes === 0;
}

/**
 * 時間主導型トリガーのエントリポイント。
 * Apps Scriptエディタの「トリガー」設定、または setupTrigger() から呼び出される。
 *
 * トリガー自体は常に1分間隔で発火するが、setupTriggerで設定した実行間隔
 * (TRIGGER_INTERVAL_PROPERTY)の倍数の分でなければ、kintoneへは一切アクセスせず
 * 即座に終了する(送信予定時刻を毎時00分/05分等のキリの良い時刻に揃えるための実装。
 * everyMinutes()はトリガー作成時刻からの相対間隔のため、この仕組みが無いと
 * setupTriggerを実行した時刻次第で送信タイミングがズレたままになる)。
 * kintoneへのAPIリクエスト数は、この「揃え」の有無に関わらず設定した間隔と同じ頻度のまま変わらない。
 *
 * LockServiceで多重実行を防ぐ(処理が長引いて次のトリガーと重なった場合、
 * 後から来た実行は何もせず終了する)。
 *
 * 設定読み込み・レコード取得失敗など、個々の行に紐付かずkintoneのERROR_MESSAGEへ
 * 書き戻せない種類のエラーはここでまとめて捕捉し、notifyAdminOnFailureで
 * 管理者へメール通知する(未設定の場合はログのみ)。顧客側はGASの実行ログを
 * 直接見られないことが多く、この通知が唯一気付ける手段になるため。
 */
function runReminderCheck() {
    const intervalMinutes =
        Number(
            PropertiesService.getScriptProperties().getProperty(
                TRIGGER_INTERVAL_PROPERTY,
            ),
        ) || DEFAULT_TRIGGER_INTERVAL_MINUTES;
    if (!isAlignedMinute(new Date(), intervalMinutes)) {
        return;
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
        Logger.log('別のリマインド処理が実行中のため、今回の実行はスキップしました。');
        return;
    }

    let config = null;
    try {
        config = loadConfig();
        const summary = processReminders(config);
        Logger.log(
            `リマインドチェック完了: 対象${summary.processed}件 / 成功${summary.succeeded}件 / ` +
                `失敗${summary.failed}件 / 処理中断疑い${summary.stuck}件`,
        );
    } catch (error) {
        Logger.log(
            `リマインドチェック処理で予期しないエラーが発生しました: ${error.stack || error.message}`,
        );
        notifyAdminOnFailure(config, 'リマインドチェック処理', error);
    } finally {
        lock.releaseLock();
    }
}

/**
 * runReminderCheckの時間主導型トリガーを作成する(初回セットアップ用)。
 * 既存の同名トリガーは重複作成を避けるため一度削除してから作成し直す。
 *
 * トリガー自体は常に1分間隔で作成する(実行間隔はTRIGGER_INTERVAL_PROPERTYに保存し、
 * runReminderCheck側のisAlignedMinuteで判定する)。これにより、setupTriggerを
 * 実行した時刻に関わらず、送信予定時刻は毎時00分/05分等のキリの良い時刻に揃う。
 * @param {number} [intervalMinutes] - 実行間隔(分)。省略時は既定値(5分)。
 *        1/5/10/15/30のいずれかを指定すること(Apps ScriptのeveryMinutes()の制約)。
 */
function setupTrigger(intervalMinutes) {
    const interval = intervalMinutes || DEFAULT_TRIGGER_INTERVAL_MINUTES;
    if (!ALLOWED_TRIGGER_INTERVALS.includes(interval)) {
        throw new Error(
            `intervalMinutesは${ALLOWED_TRIGGER_INTERVALS.join('/')}のいずれかで指定してください` +
                `(指定値: ${interval})`,
        );
    }

    removeTriggers();
    PropertiesService.getScriptProperties().setProperty(
        TRIGGER_INTERVAL_PROPERTY,
        String(interval),
    );

    ScriptApp.newTrigger('runReminderCheck').timeBased().everyMinutes(1).create();
}

/** runReminderCheckに紐づく既存のトリガーをすべて削除する */
function removeTriggers() {
    ScriptApp.getProjectTriggers()
        .filter((trigger) => trigger.getHandlerFunction() === 'runReminderCheck')
        .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

// Vitestからのテスト用に、副作用を持たないisAlignedMinuteのみをCommonJS export経由で
// 公開する。GAS実行時はmoduleが存在しないため、このブロックは実行されない。
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isAlignedMinute };
}
