// ======================================================================
//  Version    作成日(更新日)    更新者          :更新内容
//  V1.0.0     2026/09/13        J.Yamamoto      :新規作成
// ----------------------------------------------------------------------
//     ModuleName  : 納品用ファイル結合スクリプト(build.js)
//     Description : 開発用に責務ごとへ分割しているsrc配下のファイルを、
//                   dist/ReminderMail.gsへ1ファイルとして結合する。
//                   顧客先でnpm/npx/claspが使える前提が置けないため、納品物は
//                   Apps Scriptエディタへの手貼り付け1回で済む単一ファイルとする。
//                   開発側(このリポジトリ)は複数ファイル+Vitestテストのまま維持する。
// ======================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'ReminderMail.gs');

// 依存関係の分かりやすさを優先した結合順(Config→KintoneClient→Mailer→ReminderService→Main)。
// GASは同一プロジェクト内の全ファイルを1つのグローバルスコープとして扱うため、
// 実行時の動作はファイルの結合順に依存しない。
const SOURCE_FILES = [
    'Config.js',
    'KintoneClient.js',
    'Mailer.js',
    'ReminderService.js',
    'Main.js',
];

function buildFileSection(fileName) {
    const content = fs.readFileSync(path.join(SRC_DIR, fileName), 'utf-8');
    const divider = `// ---------------- ${fileName} ----------------`;
    return `${divider}\n\n${content.trimEnd()}\n`;
}

function build() {
    const sections = SOURCE_FILES.map(buildFileSection);

    fs.mkdirSync(DIST_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, sections.join('\n'), 'utf-8');
    console.log(`納品用ファイルを出力しました: ${OUTPUT_FILE}`);
}

build();
