# code-reader プラグイン 個別仕様

全体共通の開発方針は [ルートのCLAUDE.md](../../CLAUDE.md) を参照。ここには本プラグイン固有の仕様のみを記載する。

## 機能概要

レコード追加・編集画面（PC/モバイル）にスキャンボタンを表示し、カメラでQRコードまたはCODE39バーコードを読み取って、設定画面で指定した1つ以上のフィールドへ書き込む。1つのコードに複数の値が含まれる場合は、区切り文字または桁数（文字数）で分割し、複数フィールドへ順番に書き込める。

## 対応コード種別

- QRコード（[jsQR](https://github.com/cozmo/jsQR) を使用）
- CODE39バーコード（[Quagga2](https://github.com/ericblade/quagga2) を使用）

いずれもCDN経由で読み込む（`manifest.json`の`desktop.js`/`mobile.js`にURLを直接指定、バンドルしない）。

## 設定画面の項目

| 設定キー           | 型                                          | 説明                                                                                  |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `enableQr`         | `'true'`/`'false'`                          | QRコードの読み取りを有効にするか（既定: 有効）                                        |
| `enableBarcode`    | `'true'`/`'false'`                          | CODE39バーコードの読み取りを有効にするか（既定: 有効）                                |
| `splitMode`        | `'none'` / `'delimiter'` / `'fixedLength'`  | 読み取り結果の分割方法。`js/constant.js`の`SPLIT_MODE`参照                            |
| `delimiter`        | 文字列                                      | `splitMode='delimiter'`のときに使う区切り文字（プリセットまたは自由入力。空文字も可） |
| `targetFieldsJson` | JSON文字列（`[{fieldCode, length}]`の配列） | 書き込み先フィールドコードと、桁数分割時の桁数(文字数)を、書き込む順番に並べたもの    |

少なくともQR・CODE39のどちらか一方は有効である必要があり、`targetFieldsJson`は1件以上の`fieldCode`を含む必要がある。`config.js`側でバリデーションする。

### 分割方法(`splitMode`)ごとの挙動

- `none`: 分割せず、読み取った文字列をそのまま`targetFields[0]`へ書き込む（書き込み先フィールドは1つのみ指定可）
- `delimiter`: `delimiter`で`String.prototype.split()`し、分割した値を`targetFields`の並び順に書き込む
- `fixedLength`: `targetFields`各要素の`length`（文字数）で先頭から順に切り出して書き込む。`length`が未入力・0の行は「残り全部」を書き込む（複数フィールドに指定した場合、以降のフィールドは空になる点に注意）

いずれの方法でも、分割結果の要素数が書き込み先フィールド数と一致しない場合、対応する値が存在しないフィールドへは書き込みを行わない（既存の値を空で上書きしない）。

## 画面別の挙動

- `app.record.create.show` / `app.record.edit.show`（PC・モバイル）: ヘッダーメニュースペースに有効な種別ごとのスキャンボタンを表示する
- ボタン押下 → カメラダイアログ（`kintone.createDialog`/`kintone.mobile.createBottomSheet`）を開く → 読み取り結果を確認ダイアログで表示 → OKで`js/calc.js`が分割し、対象フィールドへ書き込む（`kintone.app.record.set`）
- 書き込み先フィールドコードがアプリに存在しない場合は、そのフィールドについてエラー通知を表示し、書き込みをスキップする（他のフィールドへの書き込みは継続する）

## APIリクエスト数について

本プラグインは kintone REST API を呼び出さない（イベント経由でのフィールド書き込みのみ）。

## 既知の制約

- カメラアクセスには `navigator.mediaDevices.getUserMedia` の対応ブラウザ・HTTPS環境が必要
- iOS Safari 等一部ブラウザでは、ユーザー操作（ボタンクリック）を起点にしないとカメラが起動しない場合がある
