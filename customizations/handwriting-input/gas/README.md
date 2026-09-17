# handwriting-input (GAS側)

handwriting-input kintoneカスタマイズと組み合わせて使う、Google Apps Script（GAS）側の実装です。**Web Appとして公開**し、kintone側の`desktop.js`から呼び出される中継役に専念します。Azure AI Vision（Image Analysis 4.0のRead機能）を呼び出して、画像内の手書き文字を認識し、テキストとして返します。

## reminder-notifyのGASとの違い（重要）

reminder-notifyのGASは、リマインドメールの送信元を顧客自身のアドレスにする必要があったため、**顧客のGoogleアカウント上に**個別に作成する構成でした。

本カスタマイズのGAS Web Appは、Azure APIキーを安全に中継するだけのステートレスな処理で、送信元アカウントのような制約がありません。そのため、**開発側（納品元）のGoogleアカウント上に1つだけ作成し、複数の顧客・複数のkintone環境から共通で呼び出せます**。顧客側はAzure/GASの存在を意識する必要がありません。

## 構成

| ファイル                | 責務                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `src/Config.js`         | スクリプトプロパティからの機密情報読み込み                            |
| `src/AzureOcrClient.js` | Azure AI Vision（Read機能）の呼び出し、レスポンスからのテキスト抽出   |
| `src/Main.js`           | Web Appのエントリポイント（`doPost`）。認証・エラーハンドリングを担当 |

## 処理の流れ

1. kintone側`desktop.js`が、撮影・リサイズした画像をBase64化し、共有シークレットと一緒にこのWeb AppへPOSTする（`Content-Type: text/plain`。理由は後述）
2. `doPost`が共有シークレットを検証し、一致しなければ`{ok: false, error: "認証に失敗しました。"}`を返す
3. 画像をデコードし、Azure AI Vision（Image Analysis 4.0、`features=read&language=ja`）へ送信する
4. Azureのレスポンス（`readResult.blocks[].lines[].text`）から行のテキストを取り出し、`{ok: true, text: "..."}`として返す
5. 途中で例外が発生した場合は、実行ログへ記録したうえで`{ok: false, error: "..."}`を返す（kintone側でエラー内容がそのまま通知される）

## CORSについて（重要）

GAS Web Appは`doPost`のリクエストに対するOPTIONSプリフライトを処理できません（`doOptions`が無く、プリフライトはWeb Appとして正しく応答できない）。そのため、`Content-Type: application/json`でPOSTすると、ブラウザがプリフライトを送ってしまい失敗します。

回避策として、kintone側は`Content-Type: text/plain;charset=utf-8`でPOSTします（この値はCORSの「シンプルリクエスト」に分類されるためプリフライトが発生しない）。実体はJSON文字列であり、GAS側は`e.postData.contents`をそのまま`JSON.parse()`してパースします（宣言されたContent-Typeは無視して構いません）。

また、GAS Web Appは`doPost`のレスポンスに任意のHTTPステータスコードを設定できません（常に200を返します）。そのため、成功/失敗はHTTPステータスではなく、レスポンスJSONの`ok`フィールドで判定する設計にしています。

## セットアップ手順

### 1. Azure AI Visionリソースの作成

1. [Azure Portal](https://portal.azure.com/#create/Microsoft.CognitiveServicesComputerVision)で「Computer Vision」リソースを作成する
2. **価格レベルはF0（無料）を選択する**（5,000件/月まで無料。超過するとエラーになるだけで自動課金されない。詳細は[../CLAUDE.md](../CLAUDE.md)参照）
3. 作成後、リソースの「キーとエンドポイント」から、キー（`AZURE_VISION_KEY`）とエンドポイント（`AZURE_VISION_ENDPOINT`。例: `https://xxxxx.cognitiveservices.azure.com`）を控える

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

| プロパティ名            | 説明                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `AZURE_VISION_ENDPOINT` | 手順1で控えたエンドポイント（末尾にスラッシュを付けない）                                      |
| `AZURE_VISION_KEY`      | 手順1で控えたキー                                                                              |
| `SHARED_SECRET`         | kintone側`desktop.js`の`GAS_SHARED_SECRET`と同じ値にする任意の文字列（ランダムな文字列を推奨） |

### 4. コードをプッシュしてデプロイ

```bash
npm run push
npm run deploy
```

`clasp deploy`実行後に表示される`Web app`のURLが、kintone側`desktop.js`の`GAS_WEB_APP_URL`に設定する値です（末尾は`/exec`）。

`src/appsscript.json`に`webapp`設定（`access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`）をあらかじめ含めているため、Apps Scriptエディタから手動でデプロイ設定をする場合も、「アクセスできるユーザー」を「全員」に、「次のユーザーとして実行」を「自分」にしてください。

### 5. 動作確認（curlで直接テスト）

kintone側の実装を待たずに、Web App単体の動作を確認できます。

```bash
curl -X POST '<デプロイURL>' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"sharedSecret":"<SHARED_SECRETの値>","imageBase64":"<適当な画像ファイルをbase64化した文字列>"}'
```

`{"ok":true,"text":"..."}`が返れば成功です。画像のbase64化は`base64 -w0 sample.jpg`（Linux/macOS）や`certutil -encode`（Windows）等で行えます。

## 既知の制約

- Azure AI Vision（F0無料枠）は5,000件/月・20件/分まで。超過すると`429`エラーになり、`doPost`が`{ok: false, error: "..."}`を返す（自動課金はされない）
- Google Apps Scriptの1回の実行時間上限は6分。Azureの応答が極端に遅い場合はタイムアウトする可能性がある（通常のRead機能は数秒で応答するため、現実的には問題になりにくい）
- Web AppのURLは`ANYONE_ANONYMOUS`（認証不要）で公開されるため、URLと共有シークレットの組み合わせが漏れると第三者に無料枠を消費される可能性がある。共有シークレットは推測されにくいランダムな文字列にすること
