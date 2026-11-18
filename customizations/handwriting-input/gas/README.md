# handwriting-input (GAS側)

handwriting-input kintoneカスタマイズと組み合わせて使う、Google Apps Script（GAS）側の実装です。**Web Appとして公開**し、kintone側の`desktop.js`から呼び出される中継役に専念します。Google Gemini API（マルチモーダルAI）を呼び出して、画像内の手書き文字を書き起こし、テキストとして返します（方式の経緯は[../CLAUDE.md](../CLAUDE.md)参照）。

## reminder-notifyのGASとの違い（重要）

reminder-notifyのGASは、リマインドメールの送信元を顧客自身のアドレスにする必要があったため、**顧客のGoogleアカウント上に**個別に作成する構成でした。

本カスタマイズのGAS Web Appは、Gemini APIキーを安全に中継するだけのステートレスな処理で、送信元アカウントのような制約がありません。そのため、**開発側（納品元）のGoogleアカウント上に1つだけ作成し、複数の顧客・複数のkintone環境から共通で呼び出せます**。顧客側はGemini/GASの存在を意識する必要がありません。

## 構成

| ファイル                 | 責務                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| `src/Config.js`          | スクリプトプロパティからの機密情報読み込み                                  |
| `src/GeminiOcrClient.js` | Gemini APIの呼び出し（503/429は自動リトライ）、レスポンスからのテキスト抽出 |
| `src/Main.js`            | Web Appのエントリポイント（`doPost`）。認証・エラーハンドリングを担当       |

## 処理の流れ

1. kintone側`desktop.js`が、撮影・リサイズした画像をBase64化し、共有シークレットと一緒にこのWeb AppへPOSTする（`Content-Type: text/plain`。理由は後述）
2. `doPost`が共有シークレットを検証し、一致しなければ`{ok: false, error: "認証に失敗しました。"}`を返す
3. 画像サイズを確認し、Gemini API（`generateContent`、画像＋書き起こし用プロンプト、構造化JSON出力）へ送信する。503/429が返った場合は数秒空けて最大3回まで自動リトライする
4. Geminiのレスポンス（`candidates[0].content.parts[].text`内のJSON `{"text": "..."}`）からテキストを取り出し、`{ok: true, text: "..."}`として返す
5. 途中で例外が発生した場合は、実行ログへ記録したうえで`{ok: false, error: "..."}`を返す（kintone側でエラー内容がそのまま通知される）

## CORSについて（重要）

GAS Web Appは`doPost`のリクエストに対するOPTIONSプリフライトを処理できません（`doOptions`が無く、プリフライトはWeb Appとして正しく応答できない）。そのため、`Content-Type: application/json`でPOSTすると、ブラウザがプリフライトを送ってしまい失敗します。

回避策として、kintone側は`Content-Type: text/plain;charset=utf-8`でPOSTします（この値はCORSの「シンプルリクエスト」に分類されるためプリフライトが発生しない）。実体はJSON文字列であり、GAS側は`e.postData.contents`をそのまま`JSON.parse()`してパースします（宣言されたContent-Typeは無視して構いません）。

また、GAS Web Appは`doPost`のレスポンスに任意のHTTPステータスコードを設定できません（常に200を返します）。そのため、成功/失敗はHTTPステータスではなく、レスポンスJSONの`ok`フィールドで判定する設計にしています。

## セットアップ手順

### 1. Gemini APIキーの発行

1. [Google AI Studio](https://aistudio.google.com/)にGoogleアカウントでログインし、APIキーを発行する（Cloud課金アカウントの紐付け・カード登録は不要）
2. 発行したキーを控える（`GEMINI_API_KEY`。他人に共有しない。`meter-reader`と同じキーを使い回してもよい）
3. 無料枠を超えるとエラーになるだけで自動課金されない（課金アカウントを紐付けない限り）。具体的な枠の数値はモデル・時期により変動するため、Google AI Studioで確認すること。混雑時は503/429エラーが出ることがある（詳細は[../CLAUDE.md](../CLAUDE.md)参照）

### 2. Apps Scriptプロジェクトの作成

```bash
cd customizations/handwriting-input/gas
npm install
npx clasp login
npx clasp create --type webapp --title "handwriting-input" --rootDir ./src
```

`clasp create`実行後に生成される`.clasp.json`（`scriptId`を含む）は、`.gitignore`により追跡対象外です。`.clasp.json.example`を参考に、必要であれば手動で`.clasp.json`を作成してください。

### 3. スクリプトプロパティの設定

Apps Scriptエディタの「プロジェクトの設定」→「スクリプト プロパティ」で、以下を設定します。

| プロパティ名     | 説明                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | 手順1で控えたAPIキー                                                                                                                    |
| `GEMINI_MODEL`   | （任意）使用するモデル名。未設定なら`gemini-flash-latest`。混雑でエラーが続く場合は`gemini-flash-lite-latest`等へ変更（再デプロイ不要） |
| `SHARED_SECRET`  | kintone側`desktop.js`の`GAS_SHARED_SECRET`と同じ値にする任意の文字列（ランダムな文字列を推奨）                                          |

### 4. コードをプッシュしてデプロイ

```bash
npm run push
npm run deploy
```

`clasp deploy`実行後に表示される`Web app`のURLが、kintone側`desktop.js`の`GAS_WEB_APP_URL`に設定する値です（末尾は`/exec`）。

`src/appsscript.json`に`webapp`設定（`access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`）をあらかじめ含めているため、Apps Scriptエディタから手動でデプロイ設定をする場合も、「アクセスできるユーザー」を「全員」に、「次のユーザーとして実行」を「自分」にしてください。

### 4-2. コードを更新したときの再デプロイ（重要）

Web Appは、**コードを書き換えて`clasp push`（またはGASエディタへ貼り付け）しただけでは、公開中のWeb Appには反映されません**。デプロイ済みの「バージョン」が古いコードのまま動き続けるため、必ず再デプロイが必要です（スクリプトプロパティの変更だけなら不要です）。

**URLを変えずに更新する**（推奨。`desktop.js`の`GAS_WEB_APP_URL`を書き換えなくて済む）:

```bash
npx clasp deployments                       # 更新したいデプロイのID(AKfycb…)を確認。@HEADではなく、@1などバージョン番号付きの方
npx clasp deploy --deploymentId <デプロイID>
```

または、GASエディタで［デプロイ］→［デプロイを管理］→ 対象のデプロイの鉛筆アイコン →［バージョン］を「新バージョン」にして［デプロイ］。

**注意**: `npm run deploy`（＝`clasp deploy`をIDなしで実行）は、**新しいデプロイを別のURLで作ってしまいます**。古いURLは古いコードのまま残り、`desktop.js`のURLも自動では変わらないため、更新したはずなのに動作が変わらない、という状態になります。URLが変わってしまった場合は、`desktop.js`の`GAS_WEB_APP_URL`を新しいURLへ書き換えて、kintoneへ再アップロードしてください。

### 5. 動作確認（curlで直接テスト）

kintone側の実装を待たずに、Web App単体の動作を確認できます。

```bash
curl -X POST '<デプロイURL>' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"sharedSecret":"<SHARED_SECRETの値>","imageBase64":"<適当な画像ファイルをbase64化した文字列>"}'
```

`{"ok":true,"text":"..."}`が返れば成功です。画像のbase64化は`base64 -w0 sample.jpg`（Linux/macOS）や`certutil -encode`（Windows）等で行えます。

## 既知の制約

- Gemini APIの無料枠には上限がある。超過・混雑時は`429`/`503`エラーになり（数回自動リトライ後）、`doPost`が`{ok: false, error: "..."}`を返す（自動課金はされない）。時間をおいて再実行すると成功することがある
- Gemini APIのモデル名はGoogle側の都合で廃止・変更されることがある。`models/…は提供終了`等のエラーが出たら、エラーメッセージが案内する新しいモデル名（または`-latest`エイリアス）を`GEMINI_MODEL`に設定する
- 手書き日本語・罫線入りの帳票の認識精度は、実機での十分な検証ができていない。導入前に実際のサンプルで確認すること
- Google Apps Scriptの1回の実行時間上限は6分。リトライが重なる等でGeminiの応答が極端に遅い場合はタイムアウトする可能性がある
- Web AppのURLは`ANYONE_ANONYMOUS`（認証不要）で公開されるため、URLと共有シークレットの組み合わせが漏れると第三者に無料枠を消費される可能性がある。共有シークレットは推測されにくいランダムな文字列にすること
