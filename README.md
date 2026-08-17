# kintone Customizations & Plugins

kintone の JavaScript カスタマイズ・プラグインをまとめたポートフォリオリポジトリです。
今後追加するカスタマイズ・プラグインも、このリポジトリで一元管理する前提のモノレポ構成にしています。

## 収録プラグイン・カスタマイズ

| ディレクトリ                                                                                                     | 概要                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plugins/code-reader`](./plugins/code-reader)                                                                   | QRコード（[jsQR](https://github.com/cozmo/jsQR)）・CODE39バーコード（[Quagga2](https://github.com/ericblade/quagga2)）をカメラで読み取り、指定フィールドへ書き込むkintoneプラグイン |
| [`plugins/code-reader/examples/start-completion-sample`](./plugins/code-reader/examples/start-completion-sample) | `code-reader` プラグインを利用した「着手/完了打刻」カスタマイズの実装例                                                                                                             |
| [`customizations/reminder-notify`](./customizations/reminder-notify)                                             | 期日から算出した送信予定日時になると、Google Apps Script経由でリマインドメールを自動送信するkintoneカスタマイズ + GAS                                                               |

## 技術スタック

- kintone JavaScript API / REST API
- kintoneプラグイン（`manifest.json` / 設定画面 / `@kintone/cli`）
- Google Apps Script（`clasp`、時間主導型トリガー、`UrlFetchApp`によるkintone REST API連携）
- ESLint / Prettier

## 開発方針

コーディング規約・フォルダ構成・セキュリティ方針は [CLAUDE.md](./CLAUDE.md) を参照してください。
各プラグイン・カスタマイズ固有の仕様（設定項目・フィールドコード等）は、それぞれのディレクトリ内の `CLAUDE.md` / `README.md` に記載しています。

## セットアップ

```bash
npm install
npm run lint
npm run format:check
```

各プラグインのパッケージング方法、各カスタマイズの適用方法は、それぞれの `README.md` を参照してください。

## ライセンス

[MIT License](./LICENSE)
