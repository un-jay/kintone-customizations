import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['**/test/**/*.test.js'],
        exclude: ['**/node_modules/**', '**/dist/**'],
        // 既定のforksプールは、リポジトリパスに日本語や空白が含まれる環境(Windows)で
        // ワーカープロセスの起動に失敗することがあるため、threadsプールを使用する。
        pool: 'threads',
    },
});
