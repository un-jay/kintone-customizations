# reminder-notify

期日から算出した送信予定日時になると、Google Apps Script経由でリマインドメールを自動送信するkintoneカスタマイズ + GASです。

## 構成

- `src/` — kintone側（JS/CSSカスタマイズとして対象アプリへ直接アップロードする。送信予定日時の算出・保存時バリデーション・即時送信ボタン）
- `gas/` — Google Apps Script側（対象レコードの定期チェック・メール送信・結果書き戻し）。セットアップ手順は [gas/README.md](./gas/README.md) を参照

## 特長

- 「納期」「何日前に送るか」「送信時刻」から送信予定日時を自動算出
- レコード詳細画面から手動で即時送信をリクエストできる
- 実際の送信はGAS側が担当するため、kintone側はメール送信のためのAPIリクエストを消費しない
- 送信先テーブルの「送信区分」でTO/CC/BCCを振り分け

フィールドコードは`src/constant.js`（kintone側）・`gas/src/Config.js`（GAS側）の両方に固定値として定義している。設定画面は持たないため、**対象アプリを[CLAUDE.md](./CLAUDE.md)記載のフィールドコードで作成すること**が前提となる。複数アプリで使い回したい場合はフィールドコードをアプリ側で合わせるか、`constant.js`の値を書き換えて使う。

## セットアップ

### 1. kintone側

「アプリの設定」→「JavaScript / CSSでカスタマイズ」から、以下をPC用ファイルとしてアップロードしてください（読み込み順を維持すること）。

- JavaScript: `src/constant.js` → `src/calc.js` → `src/api.js` → `src/ui.js` → `src/desktop.js`
- CSS: `src/css/51-modern-default.css` → `src/css/desktop.css`

対象アプリには、[CLAUDE.md](./CLAUDE.md) に記載のフィールドコードで、以下のフィールドを用意してください。

- 文字列: タイトル(`Title`)、メール件名(`MailSubject`)、メール本文(`MailBody`)、送信ステータス(`SendStatus`)、エラーメッセージ(`ErrorMessage`)
- 日付: 納期(`Deadline`)
- 数値: 何日前に送るか(`DaysBefore`)、送信回数(`SendCount`)
- 時刻: 送信時刻(`SendTime`)
- 日時: 送信予定日時(`ScheduledSendAt`)、送信日時(`SentAt`)
- チェックボックス等（複数選択）: 即時送信要求(`SendRequest`)
- テーブル: 送信先(`Recipients`。サブフィールド`RecipientCode`/`RecipientName`/`RecipientEmail`/`RecipientType`)

### 2. GAS側

[gas/README.md](./gas/README.md) の手順に従い、Apps Scriptプロジェクトを作成し、時間主導型トリガーを設定してください。

## ライセンス

[MIT License](../../LICENSE)
