# meter-reader (GAS側)

meter-reader kintoneカスタマイズと組み合わせて使う、Google Apps Script(GAS)側の実装です。**Web Appとして公開**し、kintone側の`desktop.js`から呼び出される中継役に専念します。Google Gemini API(マルチモーダルモデル)を呼び出して、画像内のアナログ針メーター・デジタル表示メーターから数値を読み取り、構造化されたJSONとして返します。

## 重要: 無料枠(Free Tier)について

このセッションはネットワークポリシーにより`ai.google.dev`へ直接アクセスできないため、Web検索経由での確認になりますが、[Gemini API公式の料金ページ](https://ai.google.dev/gemini-api/docs/pricing)の内容として次の点を確認しています(2026年9月時点)。

- **Free Tierの利用にCloud課金アカウントの紐付けは不要**。有償のTier 1へ移行するには、明示的に課金アカウントを紐付ける操作が必要で、自動的には移行しない
- Free Tierの「spend-based rate limit(利用額ベースのレート制限)」は"N/A"扱いで、Free Tierには課金の仕組み自体が存在しない。無料枠のリクエスト数の上限(RPM/RPD等)を超えた場合は429エラーになるだけで、課金アカウントを紐付けていない限り自動課金は発生しない

一方で、**具体的なレート制限の数値(1分/1日あたりのリクエスト数)・現行のモデル名・料金体系の細部は、モデルや時期によって変動しており(2025年12月に無料枠が引き下げられたとする第三者記事も複数ある)、出典間で数値が食い違っているため、本READMEでは特定の数値を断定していません。** 以下のセットアップ手順・`src/GeminiVisionClient.js`のリクエスト形式は、既知の情報を基に実装したものです。**導入前に必ず[Gemini API公式ドキュメント](https://ai.google.dev/gemini-api/docs)・[Gemini APIレート制限ページ](https://ai.google.dev/gemini-api/docs/rate-limits)、および実際に発行したAPIキーのプロジェクトについて[Google AI Studio](https://aistudio.google.com/)の利用量/割り当てページで最新情報を確認してください。**

## reminder-notify・handwriting-inputのGASとの違い

reminder-notifyのGASは、リマインドメールの送信元を顧客自身のアドレスにする必要があったため、顧客のGoogleアカウント上に個別に作成する構成でした。

本カスタマイズ・`handwriting-input`のGAS Web Appは、APIキーを安全に中継するだけのステートレスな処理で、送信元アカウントのような制約がありません。そのため、**開発側(納品元)のGoogleアカウント上に1つだけ作成し、複数の顧客・複数のkintone環境から共通で呼び出せます**。顧客側はGemini/GASの存在を意識する必要がありません。

## 構成

| ファイル                    | 責務                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `src/Config.js`             | スクリプトプロパティからの機密情報読み込み                          |
| `src/GeminiVisionClient.js` | Gemini API(generateContent)の呼び出し、レスポンスからの結果抽出     |
| `src/Main.js`               | Web Appのエントリポイント(`doPost`)。認証・エラーハンドリングを担当 |

## 処理の流れ

1. kintone側`desktop.js`が、撮影・リサイズした画像をBase64化し、共有シークレットと一緒にこのWeb AppへPOSTする(`Content-Type: text/plain`。理由は後述)
2. `doPost`が共有シークレットを検証し、一致しなければ`{ok: false, error: "認証に失敗しました。"}`を返す
3. 画像をデコードしてサイズを検証したうえで、Gemini API(`generateContent`)へ、メーター読み取り用のプロンプトと画像を送信する。`generationConfig.responseSchema`により、`{meterType, value, unit, confidence, rawLabel}`の構造化JSONで結果を受け取る
4. `{ok: true, result: {...}}`として、kintone側へ返す
5. 途中で例外が発生した場合は、実行ログへ記録したうえで`{ok: false, error: "..."}`を返す(kintone側でエラー内容がそのまま通知される)

## CORSについて(重要)

GAS Web Appは`doPost`のリクエストに対するOPTIONSプリフライトを処理できません。そのため、`Content-Type: application/json`でPOSTすると、ブラウザがプリフライトを送ってしまい失敗します。

回避策として、kintone側は`Content-Type: text/plain;charset=utf-8`でPOSTします(CORSの「シンプルリクエスト」に分類されるためプリフライトが発生しない)。実体はJSON文字列であり、GAS側は`e.postData.contents`をそのまま`JSON.parse()`してパースします(宣言されたContent-Typeは無視して構いません)。

また、GAS Web Appは`doPost`のレスポンスに任意のHTTPステータスコードを設定できません(常に200を返します)。そのため、成功/失敗はHTTPステータスではなく、レスポンスJSONの`ok`フィールドで判定する設計にしています。

## セットアップ手順

### 1. Google AI StudioでのAPIキー発行

1. [Google AI Studio](https://aistudio.google.com/)にアクセスし、Googleアカウントでログインする
2. 「Get API key」からAPIキーを発行する(発行時にCloud課金アカウントの紐付けは必須ではない。無料枠の詳細・現行モデル名は[Gemini API公式ドキュメント](https://ai.google.dev/gemini-api/docs)を必ず確認すること)
3. 発行されたAPIキー(`GEMINI_API_KEY`)を控える

### 2. Apps Scriptプロジェクトの作成

```bash
cd customizations/meter-reader/gas
npm install
npx clasp login
npx clasp create --type webapp --title "meter-reader" --rootDir ./src
```

`clasp create`実行後に生成される`.clasp.json`(`scriptId`を含む)は、`.gitignore`により追跡対象外です。`.clasp.json.example`を参考に、必要であれば手動で`.clasp.json`を作成してください。

### 3. スクリプトプロパティの設定

Apps Scriptエディタの「プロジェクトの設定」→「スクリプト プロパティ」で、以下を設定します。

| プロパティ名     | 説明                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | 手順1で発行したAPIキー                                                                       |
| `GEMINI_MODEL`   | (任意)使用するモデル名。未設定の場合は`src/Config.js`の`GEMINI_DEFAULT_MODEL`(要検証)を使う  |
| `SHARED_SECRET`  | kintone側`desktop.js`の`GAS_SHARED_SECRET`と同じ値にする任意の文字列(ランダムな文字列を推奨) |

### 4. コードをプッシュしてデプロイ

```bash
npm run push
npm run deploy
```

`clasp deploy`実行後に表示される`Web app`のURLが、kintone側`desktop.js`の`GAS_WEB_APP_URL`に設定する値です(末尾は`/exec`)。

`src/appsscript.json`に`webapp`設定(`access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`)をあらかじめ含めているため、Apps Scriptエディタから手動でデプロイ設定をする場合も、「アクセスできるユーザー」を「全員」に、「次のユーザーとして実行」を「自分」にしてください。

### 4-2. コードを更新したときの再デプロイ(重要)

Web Appは、**コードを書き換えて`clasp push`(またはGASエディタへ貼り付け)しただけでは、公開中のWeb Appには反映されません**。デプロイ済みの「バージョン」が古いコードのまま動き続けるため、必ず再デプロイが必要です(スクリプトプロパティの変更だけなら不要です)。

**URLを変えずに更新する**(推奨。`desktop.js`の`GAS_WEB_APP_URL`を書き換えなくて済む):

```bash
npx clasp deployments                       # 更新したいデプロイのID(AKfycb…)を確認。@HEADではなく、@1などバージョン番号付きの方
npx clasp deploy --deploymentId <デプロイID>
```

または、GASエディタで［デプロイ］→［デプロイを管理］→ 対象のデプロイの鉛筆アイコン →［バージョン］を「新バージョン」にして［デプロイ］。

**注意**: `npm run deploy`(＝`clasp deploy`をIDなしで実行)は、**新しいデプロイを別のURLで作ってしまいます**。古いURLは古いコードのまま残り、`desktop.js`のURLも自動では変わらないため、更新したはずなのに動作が変わらない、という状態になります。URLが変わってしまった場合は、`desktop.js`の`GAS_WEB_APP_URL`を新しいURLへ書き換えて、kintoneへ再アップロードしてください。

### 5. 動作確認(curlで直接テスト)

kintone側の実装を待たずに、Web App単体の動作を確認できます。

```bash
curl -X POST '<デプロイURL>' \
  -H 'Content-Type: text/plain;charset=utf-8' \
  -d '{"sharedSecret":"<SHARED_SECRETの値>","imageBase64":"<適当な画像ファイルをbase64化した文字列>"}'
```

`{"ok":true,"result":{"meterType":"...", "value":..., "unit":"...", "confidence":"...", "rawLabel":"..."}}`が返れば成功です。画像のbase64化は`base64 -w0 sample.jpg`(Linux/macOS)や`certutil -encode`(Windows)等で行えます。

## 既知の制約

- **具体的なレート制限の数値・現行のモデル名は変動するため、本READMEでは断定していません。** 「Free Tierは課金アカウント紐付け不要・自動課金されない」という設計上の前提はWeb検索経由で確認済みですが、導入前に必ず[Gemini API公式ドキュメント](https://ai.google.dev/gemini-api/docs)・[Google AI Studio](https://aistudio.google.com/)で最新情報を確認してください
- Google Apps Scriptの1回の実行時間上限は6分。Gemini APIの応答が極端に遅い場合はタイムアウトする可能性がある
- Web AppのURLは`ANYONE_ANONYMOUS`(認証不要)で公開されるため、URLと共有シークレットの組み合わせが漏れると第三者に無料枠を消費される可能性がある。共有シークレットは推測されにくいランダムな文字列にすること
- アナログ針メーターの読み取りは、目盛りの間隔・照明条件・撮影角度・針と目盛りの重なり方に大きく左右される。100%の精度は保証できないため、kintone側で必ず作業者が確認する運用を前提とする
