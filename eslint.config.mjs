import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

const kintoneGlobals = {
    kintone: 'readonly',
    jsQR: 'readonly',
    Quagga: 'readonly',
};

const gasGlobals = {
    UrlFetchApp: 'readonly',
    PropertiesService: 'readonly',
    MailApp: 'readonly',
    GmailApp: 'readonly',
    ScriptApp: 'readonly',
    Utilities: 'readonly',
    Logger: 'readonly',
};

const baseRules = {
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-restricted-properties': [
        'error',
        {
            property: 'innerHTML',
            message:
                'innerHTML によるHTML文字列の動的生成は禁止です。document.createElement を使用してください。',
        },
    ],
};

export default [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/*.min.js',
            '**/css/51-modern-default.css',
        ],
    },
    {
        // kintone プラグイン / カスタマイズ（ブラウザ上で動作するJS）
        files: ['plugins/**/src/**/*.js', 'customizations/**/src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...kintoneGlobals,
            },
        },
        rules: baseRules,
    },
    {
        // Google Apps Script（V8ランタイム上で動作するJS）
        files: ['customizations/**/gas/src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...gasGlobals,
            },
        },
        rules: baseRules,
    },
    {
        // Vitestによるユニットテスト（Node上でESM importを使用）
        files: ['**/test/**/*.test.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
                ...kintoneGlobals,
            },
        },
        rules: baseRules,
    },
    eslintConfigPrettier,
];
