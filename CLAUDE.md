# kintone プラグイン・カスタマイズ開発方針

## 概要

本リポジトリで開発する kintone プラグイン・カスタマイズ群に共通する開発方針・コーディング規約を定める。機能ごとの個別仕様（機能・計算式・画面レイアウト・フィールドコード等）は、`plugins/<プラグイン名>/CLAUDE.md` または `customizations/<カスタマイズ名>/CLAUDE.md` に記載する。

# 開発方針

- kintone Documentation MCP Server を利用して実装すること
- 公式API・公式仕様に従うこと
- [kintoneセキュアコーディングガイドライン](https://cybozu.dev/ja/kintone/docs/guideline/secure-coding-guideline/)・[kintoneコーディングガイドライン](https://cybozu.dev/ja/kintone/docs/guideline/coding-guideline/)に準拠すること。詳細は[セキュリティ方針](#セキュリティ方針)を参照
- 保守性・可読性を最優先とする
- プラグインのパッケージング・アップロードには `@kintone/cli`（`cli-kintone` npm パッケージおよび `kintone-plugin-packer`/`kintone-plugin-uploader` は非推奨）を使用する
- `manifest.json` の `version` はセマンティックバージョニング（`x.y.z` 形式の文字列。例: `"1.0.0"`）で管理する

# リポジトリ構成

本リポジトリは、複数のプラグイン・カスタマイズを1つのリポジトリで管理するモノレポ構成とする。

```
kintone/
├── plugins/                 # kintoneプラグイン（設定画面を持ち、複数アプリへ再利用できるもの）
│   └── <plugin-name>/
│       └── examples/         # (任意) そのプラグイン専用の利用サンプルカスタマイズ
│           └── <sample-name>/
├── customizations/           # 特定のプラグインに依存しない、独立したJS/CSSカスタマイズ
│   └── <customization-name>/
└── CLAUDE.md                 # 本ファイル（全体共通の開発方針）
```

新しいプラグイン・カスタマイズを追加する場合も、この構成に従いディレクトリを追加する。

- 特定のプラグインを前提とし、その使い方を示すサンプルカスタマイズ → `plugins/<plugin-name>/examples/<sample-name>/`
- 特定のプラグインに依存しない、独立したカスタマイズ → `customizations/<customization-name>/`

## プラグインのフォルダ構成

設定画面（config.html/config.js）を持ち、複数アプリで再利用することを前提とするものは `plugins/<plugin-name>/` に以下の構成で配置する。

```
plugins/<plugin-name>/
├── CLAUDE.md
├── README.md
├── package.json
└── src
    ├── manifest.json
    ├── html/config.html
    ├── js/
    │   ├── constant.js
    │   ├── common.js
    │   ├── api.js
    │   ├── calc.js
    │   ├── ui.js
    │   ├── desktop.js
    │   └── config.js
    ├── css/
    │   ├── 51-modern-default.css
    │   ├── common.css
    │   ├── desktop.css
    │   └── config.css
    └── image/icon.png
```

DOM操作を伴う一体のUIコンポーネント（カメラ制御・ダイアログ生成など）が複数ファイルにまたがる場合は、`js/ui/` のようにサブディレクトリへ集約してよい。ただし DOM操作はこのUI層のファイル群でのみ行い、`desktop.js`/`api.js`/`calc.js` からは行わない。

## カスタマイズ（プラグイン化しないもの）のフォルダ構成

特定アプリのフィールドコードに依存し、設定画面を持たない単発カスタマイズは `customizations/<customization-name>/` に以下の構成で配置する。`manifest.json`・`config.js` は持たない。

```
customizations/<customization-name>/
├── CLAUDE.md
├── README.md
└── src
    ├── desktop.js
    └── css/
        ├── 51-modern-default.css  # (必要な場合、第三者ファイル)
        └── desktop.css
```

プラグインと異なり `@kintone/cli` によるパッケージングが無く、「JavaScript / CSSでカスタマイズ」画面から**手作業で1ファイルずつアップロードする**運用になる。ファイルを分けるほどアップロードの手間・順序ミスのリスクが増えるため、`constant.js`/`calc.js`/`api.js`/`ui.js` のような責務ごとのファイル分割はせず、`desktop.js` 1ファイルに責務ごとのセクションコメント（`// ==========================` 区切り）でまとめる。CSSも同様に、第三者ファイル（51-modern-default.css等）以外は `desktop.css` 1ファイルにまとめる。

特定のプラグインの使い方を示すサンプルカスタマイズも、同じ構成で `plugins/<plugin-name>/examples/<sample-name>/` に配置する（`CLAUDE.md`にそのプラグインへの依存関係を明記する）。

**kintoneはJS/CSSカスタマイズをプラグインより先に読み込む**（プラグインは後）。そのため、カスタマイズがプラグインの公開する名前空間（`window.<Namespace>`）に依存する場合、ファイルのトップレベルで一度だけ変数へキャプチャしてはいけない（その時点ではまだ`undefined`で、後からプラグインが読み込まれても反映されない）。`kintone.events.on()`のイベントハンドラー内（＝実際に発火するタイミングで、全スクリプト読み込み後）で、その都度`window.<Namespace>`を読み直すこと。

# 各ファイルの責務

以下はプラグイン（`@kintone/cli`で自動パッケージングするため、ファイルを分けてもデプロイの手間が増えない）における責務分担。

- **desktop.js**: イベント制御のみ（イベント登録→設定取得→api.js→calc.js→ui.js）。API処理・DOM操作・計算処理は禁止
- **api.js**: REST APIのみ。DOM操作・計算処理は禁止
- **calc.js**: データ集計・計算処理。DOM操作・API呼び出し・副作用は禁止
- **ui.js**: HTML生成・DOM操作・画面描画。DOM操作を許可する唯一のファイル。API呼び出しは禁止
- **common.js**: 共通関数（日付変換・時間変換・フォーマット等）
- **constant.js**: 定数管理（フィールドコード・イベント名・設定キー・固定文字列等）
- **config.js**: プラグイン設定画面

すべてのファイルが必須というわけではない。機能上不要なファイル（例: REST APIを呼ばないプラグインの `api.js`）は作成しなくてよい。

カスタマイズ（手作業アップロード）では、上記の責務分担を `desktop.js` 1ファイル内のセクションコメントとして表現する（責務の考え方自体は変えない。ファイルを物理的に分けないだけ）。

# コーディング規約

- ES6で実装 / const・let を使用 / async・await を使用（Promiseチェーン禁止）/ var禁止
- 1ファイル1責務、単一責任を徹底する。ネストは浅くする
- DOM操作は ui.js（またはUI層のファイル群）のみ／API呼び出しは api.js のみ／計算処理は calc.js のみ（calc.js は副作用禁止）
- 共通処理は common.js、定数は constant.js
- desktop.js は100〜200行以内を目安とする
- インデントは半角スペース4つ（タブ文字は使用しない）。第三者ファイル（51-modern-default.css等）は`.prettierignore`で整形対象から除外する
- コメントを書けるファイル（.js/.css/.html。.jsonを除く）には[ファイルヘッダー規約](#ファイルヘッダー規約)のヘッダーを先頭に付与する
- ファイル間で共有する定数・関数は専用のグローバル名前空間オブジェクトの下に定義し、生のグローバル変数を作らない（名前空間名はプラグイン・カスタマイズごとに定める）。詳細は[セキュリティ方針](#セキュリティ方針)を参照

# ファイルヘッダー規約

コメントを記述できるファイル（`.js` / `.css` / `.html`。`.json` はコメント構文がないため対象外）の先頭に、以下の形式のヘッダーを付与する。コメント記号はファイルの種類に合わせる（`.js` は `//`、`.css` は `/* */`、`.html` は `<!-- -->`）。

```
======================================================================
 Version    作成日(更新日)    更新者          :更新内容
 V1.0.0     2026/08/17        J.Yamamoto      :新規作成
----------------------------------------------------------------------
     ModuleName  : （ファイル名に応じて記載）
     Description : （ファイルの役割を簡潔に記載）
======================================================================
```

- 新規作成時は `V1.0.0`・「新規作成」の1行から開始する
- 修正のたびに、`Version` をインクリメントした行を追加する（既存行は残し、履歴として積み重ねる）
- 第三者（他社・OSS）のファイルをそのまま配置する場合は、このヘッダーを付与しない（元のライセンス表示を優先する）

# UI設計方針

- kintone標準一覧に近いデザインとする
- kintone公式のCSS（51-modern-default等）は利用可とする
- kintone内部DOM構造や、非公開の内部CSSクラス（recordlist-gaia等）には依存しない
- 独自のUI要素（一覧・グラフ表現等）はHTML/CSSで実装する
- 将来共通UIライブラリ（common.css）として流用できる構成とする
- `innerHTML` によるHTML文字列の動的生成は行わない。詳細は[セキュリティ方針](#セキュリティ方針)を参照
- ネイティブの `alert`/`confirm` ではなく、`kintone.createDialog`（モバイルは `kintone.mobile.createBottomSheet`）・`kintone.showNotification`（モバイルは `kintone.mobile.showNotification`）を使用し、kintoneのUIと統一感を持たせる

# セキュリティ方針

[kintoneセキュアコーディングガイドライン](https://cybozu.dev/ja/kintone/docs/guideline/secure-coding-guideline/)、[kintoneコーディングガイドライン](https://cybozu.dev/ja/kintone/docs/guideline/coding-guideline/)に従うこと。本CLAUDE.mdの記載と、kintone Documentation MCP Serverで確認できる最新の公式情報が矛盾する場合は、公式情報を優先し、CLAUDE.mdを更新する。

- XSS対策として、`innerHTML`・`document.write` によるHTML文字列の動的生成を避け、`document.createElement` と `textContent` でDOM要素を組み立てる
- 他プラグイン・カスタマイズとのグローバル変数衝突を避けるため、ファイル間で共有する定数・関数は専用のグローバル名前空間オブジェクトの下に定義する。ファイル内でのみ使う内部処理は、即時関数（IIFE）のスコープに閉じ、名前空間には公開しない
- 厳格モード（`'use strict'`）を全JSファイルで使用する
- URLの取得には `kintone.api.url()` または `kintone.api.urlForGet()` を使用する
- `location.href` 等に渡すURLを動的生成する場合は、外部からの入力値をそのまま連結せず、想定した値（数値のみ等）であることを確認する
- APIトークンやパスワード等の認証情報は、ソースコードに直接埋め込まない。Google Apps Scriptの場合は `PropertiesService`（スクリプトプロパティ）に保存する

# APIリクエスト数について

kintoneは契約プランごとに、1日あたりのAPIリクエスト数（`kintone.api()`経由のREST API呼び出し回数）に上限がある。実装・改修時は消費数を意識すること。

- **1回のGETで取得できる最大件数は500件**（`fields`指定の有無に関わらず共通）。500件を超えるデータを取得する場合、`$id`昇順のseek法（`$id > 最後に取得したid`）でループし、501件目以降のためにもう1回GETリクエストが発生する。`offset`によるページングはoffsetの上限があるため使用しない
- **クライアント側（ブラウザ）で完結する処理（絞り込み・並び替え・ページ送り・表示単位の切替など）は、追加のAPIリクエストを発生させない。** 取得済みのレコード配列に対してJavaScriptで処理すること
- **画面を自動更新（`setInterval`によるポーリングや`location.reload()`）する機能を実装する場合、更新間隔がそのままAPIリクエスト消費のペースになる。** 1分間隔なら1時間で最大60回分のリクエストセットが発生するため、既定値は短すぎない間隔（5分など）にし、間隔は設定可能にする
- Google Apps Scriptの時間主導型トリガーでkintone REST APIを定期的に呼び出す場合も同様に、既定のトリガー間隔は短すぎないものとし、間隔を変更しやすい形（スクリプトプロパティ等）にする
- `kintone.plugin.app.getConfig`/`setConfig`はプラグイン専用の設定APIであり、REST APIのリクエスト数上限とは別枠（カウントされない）
- 正確な上限値は契約プランに依存し、本CLAUDE.mdでは断定しない。プラグイン・カスタマイズごとの具体的な消費パターン（操作ごとに何回リクエストが発生するか）は、各々のCLAUDE.mdに記載する

# Claudeへの実装依頼

以下を遵守して実装してください。

- kintone Documentation MCP Server を利用し、公式API・公式仕様に従って実装してください
- 保守性・可読性を最優先してください
- 責務分離を徹底してください
- コーディング規約を遵守してください
- UIはHTML/CSSで実装してください
- kintone公式のCSS（51-modern-default等）は利用可とします
- kintone内部DOM構造や、非公開の内部CSSクラス（recordlist-gaia等）には依存しないでください
- 独自のUI要素はHTML/CSSで実装してください
- コードには適切なJSDocコメントを付与してください
- エラーハンドリング、入力値チェック、例外処理を実装してください
- 可読性を重視し、リファクタリングしやすいコードとしてください
