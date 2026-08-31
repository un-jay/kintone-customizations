# start-completion-sample 個別仕様

全体共通の開発方針は [ルートのCLAUDE.md](../../../../CLAUDE.md) を参照。ここには本カスタマイズ固有の仕様のみを記載する。

## 依存プラグイン

[`code-reader`](../../) が提供する `window.CodeReaderPlugin` 名前空間（`QRReader`/`BarcodeReader`/`CodeReaderBase`/`splitScannedValue`/`SPLIT_MODE`）に依存する。プラグインを先にアプリへ追加しておくこと。読み取ったコードの分割処理は、プラグイン本体の`js/calc.js`にある`splitScannedValue`をそのまま再利用している（分割ロジックを二重実装しない）。

**注意**: kintoneはJS/CSSカスタマイズをプラグインより先に読み込むため（[ルートのCLAUDE.md](../../../../CLAUDE.md)参照）、`window.CodeReaderPlugin`はファイルのトップレベルでは変数にキャプチャせず、各`kintone.events.on()`ハンドラー内で都度読み直している。プラグインが未読み込みの場合はコンソールにエラーを出して安全に処理を打ち切る（`isPluginLoaded()`）。

## フィールドコード・分割設定（サンプル値）

`src/desktop.js` 冒頭の `CONFIG` で定義。実アプリに合わせて変更する。

| 設定                    | サンプル値                                                                                                                                                                    | 説明                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CONFIG.SPLIT_MODE`     | `CodeReaderPlugin.SPLIT_MODE.FIXED_LENGTH`                                                                                                                                    | 読み取ったコードの分割方法（`FIXED_LENGTH`=桁数分割 / `DELIMITER`=区切り文字分割）         |
| `CONFIG.DELIMITER`      | `,`                                                                                                                                                                           | `SPLIT_MODE=DELIMITER`のときに使う区切り文字（`FIXED_LENGTH`のときは未使用）               |
| `CONFIG.ID_FIELDS`      | `[{fieldCode:'SEIBAN',length:6}, {fieldCode:'HINMOKU_ID',length:1}, {fieldCode:'BUMON_ID',length:2}, {fieldCode:'SAKUZU_ID',length:1}, {fieldCode:'SAKUZU_SUB_ID',length:1}]` | 分割した値を書き込む順番のフィールドコードと桁数（`FIXED_LENGTH`のときのみ`length`を使用） |
| `CONFIG.FIELD_START_AT` | `TYAKUSYU_DT`                                                                                                                                                                 | 着手時刻を設定する日時フィールド                                                           |
| `CONFIG.FIELD_END_AT`   | `KANRYO_DT`                                                                                                                                                                   | 完了時刻を設定する日時フィールド（このフィールドが空のレコードを「未完了」とみなす）       |

## 画面遷移のフロー

1. 一覧画面で「着手」または「完了」ボタンを押す
2. カメラでQRコード/バーコードを読み取る（`CONFIG.SPLIT_MODE`に従って`CONFIG.ID_FIELDS`の数だけ分割）
3. **着手**: 分割した値の組み合わせが未完了レコードとして存在する場合はエラー通知。存在しなければ、読み取った生のコードを`sessionStorage`へ保存しレコード追加画面へ遷移。追加画面表示時に`sessionStorage`から値を読み出して再分割し、各IDフィールドと開始時刻を自動入力（IDフィールドがルックアップの場合は自動取得も行う）
4. **完了**: 分割した値に一致する未完了レコードを一覧から検索し、見つかった場合は編集画面へ遷移。編集画面表示時に`sessionStorage`の値を再分割し、各IDフィールドと一致することを確認して終了時刻を自動入力

## APIリクエスト数について

一覧画面表示時に取得済みの `event.records` に対してJavaScript側で照合するのみで、追加のAPIリクエストは発生しない。
