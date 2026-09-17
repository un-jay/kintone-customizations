# handwriting-input

紙に手書きされたメモを撮影するだけで、文字を自動認識してkintoneのフィールドへ転記するkintoneカスタマイズ + GAS（Azure AI Visionへの中継Web App）です。

## 背景

製造業の現場ではタブレットへの直接入力に抵抗があり、紙のメモがなかなか無くならない、という課題に向けたカスタマイズです。作業者は今まで通り紙にメモを書き、**それを撮影するだけ**でkintoneへ文字として記録できます。手書きの習慣そのものを変える必要がありません。

## 構成

- `src/` — kintone側（JS/CSSカスタマイズとして対象アプリへ直接アップロードする。撮影UI・リサイズ・GAS呼び出し・kintoneへの反映）
- `gas/` — Google Apps Script側（Azure AI Visionへの中継Web App）。セットアップ手順は [gas/README.md](./gas/README.md) を参照

## 特長

- 写真を撮る（または選ぶ）→「文字にする」→ 内容を確認 → 「反映する」の4ステップだけで完結。非IT専門家でも直感的に使える
- Azure AI Vision（Image Analysis 4.0のRead機能）による手書き日本語認識。無料枠（5,000件/月）を超えてもエラーになるだけで自動課金されない設計（詳細は[CLAUDE.md](./CLAUDE.md)参照）
- AzureのAPIキーはGAS側にのみ保持し、ブラウザ側には一切渡さない
- 認識結果は編集可能なプレビューを経てから反映するため、OCRの誤認識をその場で修正できる（「下書き自動作成」という位置付け）
- 撮影した写真の原本も添付ファイルとして自動保存されるため、後から見返せる（現物との突き合わせ・監査対応）
- 1レコードに複数の手書き入力欄を設定可能（`HANDWRITING_TARGETS`配列で構成）

## なぜこの方式か（技術選定の経緯）

以下は実装前に検証した内容で、方針を再検討する際は必ず踏まえてください（詳細は[CLAUDE.md](./CLAUDE.md)参照）。

1. **ブラウザ内蔵の無料OCR（Tesseract.js）は不採用**: マス目に区切って1文字ずつ認識させる方式を検証したが、単純な英字ですら誤認識し、空白のマスにも幻の文字を検出するなど、実用に耐えなかった
2. **OS標準の手書き認識（Windows Ink/Scribble等）も不採用**: これは「タブレットに直接ペンで書く」方式向けの機能であり、「紙に書かれた既存のメモを読み取る」という本来の要求とは前提が異なる
3. **Azure AI Vision（無料枠）を採用**: 手書き日本語に対応しており、無料枠を超えても自動課金されない安全な設計。登録の手間は増えるが、精度と安全な無料運用を両立できる唯一の現実的な選択肢だった

## 処理の流れ

```mermaid
sequenceDiagram
    actor User as 作業者
    participant Kintone as kintone(レコード追加/編集画面)
    participant GAS as GAS Web App
    participant Azure as Azure AI Vision

    User->>Kintone: 「手書きメモを読み取る」ボタンをクリック
    Kintone-->>User: 撮影用オーバーレイを表示
    User->>Kintone: 写真を撮影/選択
    Kintone->>Kintone: クライアント側でリサイズ(長辺1600px)
    User->>Kintone: 「文字にする」をクリック
    Kintone->>GAS: 画像(Base64)+共有シークレットをPOST
    GAS->>Azure: 画像を送信(Read機能, language=ja)
    Azure-->>GAS: 認識結果(行ごとのテキスト)
    GAS-->>Kintone: {ok: true, text: "..."}
    Kintone-->>User: 既存の内容に追記したプレビューを表示(編集可能)
    User->>Kintone: 内容を確認・修正し「反映する」をクリック
    Kintone->>Kintone: 写真をkintoneへアップロード(fileKey取得)
    Kintone->>Kintone: kintone.app.record.set()でテキスト・写真を反映
```

## デモ用kintoneアプリの構成案:「現場日報」

顧客デモ・検証用に、以下のようなシンプルな日報アプリを想定しています。実運用では、対象顧客の既存の日報・点検記録アプリにフィールドを追加する形でも組み込めます。

### フィールド一覧

| フィールドコード   | 型                                     | 説明                                                         |
| ------------------ | -------------------------------------- | ------------------------------------------------------------ |
| `RECORD_DATE`      | 日付                                   | 日付                                                         |
| `WORKER_NAME`      | 文字列（1行）                          | 作業者名                                                     |
| `PROCESS_LINE`     | 文字列（1行）                          | 工程・ライン名                                               |
| `WORK_NOTES`       | 文字列（複数行）                       | 作業内容（手書き入力対応）                                   |
| `space_work_notes` | スペース（要素ID: `space_work_notes`） | 「作業内容を手書きメモから読み取る」ボタンの設置場所         |
| `WORK_NOTES_PHOTO` | 添付ファイル                           | 作業内容メモの写真（原本、自動保存）                         |
| `REMARKS`          | 文字列（複数行）                       | 気づき・特記事項（手書き入力対応）                           |
| `space_remarks`    | スペース（要素ID: `space_remarks`）    | 「気づき・特記事項を手書きメモから読み取る」ボタンの設置場所 |
| `REMARKS_PHOTO`    | 添付ファイル                           | 特記事項メモの写真（原本、自動保存）                         |

### レイアウト上の注意

スペースフィールドは、対応する文字列フィールドの**直後**に配置してください（ボタンがどのフィールド向けかが一目で分かるようにするため）。スペースフィールドの要素IDは、フィールド配置後に「スペースフィールド」設定画面で指定します（`src/desktop.js`の`HANDWRITING_TARGETS`の`spaceId`と一致させること）。

## デモの見せ方（提案）

1. 白紙に「本日の作業:部品Aの組立完了。午後は検品予定。」のようなメモを実際に手書きする
2. スマートフォン/タブレットでそのメモを撮影し、「文字にする」を押す
3. 数秒後にテキストへ変換された内容が表示され、「反映する」でkintoneのレコードに即座に反映される様子を見せる
4. 添付ファイルに撮影した写真そのものも残っている点（原本との突き合わせができる）もあわせて紹介する

「紙をやめさせる」のではなく「紙の運用のまま、記録だけkintoneに残せる」という導入ハードルの低さが訴求ポイントです。

## セットアップ

### 1. GAS側（Azure中継Web App）

[gas/README.md](./gas/README.md) の手順に従い、Azureリソースの作成・GAS Web Appのデプロイを行ってください。**この手順は開発側（納品元）が一度だけ行うもので、顧客側の作業ではありません。**

### 2. kintone側

対象アプリに、上記「デモ用kintoneアプリの構成案」を参考にフィールドを作成してください（実際のフィールドコード・要素IDは`src/desktop.js`の`HANDWRITING_TARGETS`と一致させること）。

`src/desktop.js`の以下2箇所を、実際の値に書き換えてください。

```js
const GAS_WEB_APP_URL =
    'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';
const GAS_SHARED_SECRET = 'REPLACE_WITH_SHARED_SECRET';
```

「アプリの設定」→「JavaScript / CSSでカスタマイズ」から、以下をPC用ファイルとしてアップロードしてください。

- JavaScript: `src/desktop.js`
- CSS: `src/css/desktop.css`

## 動作確認済みの範囲・未検証の範囲（正直な現状）

- `src/desktop.js`の純粋関数（文字列結合・画像サイズ計算・レスポンス解析）と、`gas/src/AzureOcrClient.js`のレスポンス解析処理はVitestで単体テスト済み（`npm run test`）
- マス目キャンバス方式のOCR精度を検証した際と同じ方法（ブラウザでの実機検証）で、canvas読み込み→リサイズ→Base64化までの一連の処理を動作確認済み
- **Azure AI Visionへの実際のリクエスト・実際の手書き文字での認識精度は、Azureアカウントを持たない環境のため未検証です。** 導入前に、実際の顧客の手書きサンプルで認識精度を確認してください
- kintone実機（レコード追加・編集画面でのスペース要素へのボタン設置、ファイルアップロード、`kintone.app.record.set()`）でのエンドツーエンドの動作も、実際のkintone環境が無いため未検証です。導入前に必ず実機で確認してください

## 既知の制約

[CLAUDE.md](./CLAUDE.md) の「既知の制約」を参照してください。

## ライセンス

[MIT License](../../LICENSE)
