import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
            // Note: Some code (JWT WebCrypto, waitUntil, profanity filter) requires 
            // Cloudflare Workers runtime and cannot be tested in Node environment.
            // Thresholds adjusted accordingly - consider @cloudflare/vitest-pool-workers for higher coverage.
            thresholds: {
                lines: 85,
                functions: 85,
                branches: 80,
                statements: 85,
            },
        },
        globals: true,
    },
    resolve: {
        // Handle .js imports in TypeScript source files
        alias: [
            // Resolve .js imports to .ts files
            { find: /^(.+)\.js$/, replacement: '$1' },
        ],
    },
    esbuild: {
        target: 'node18',
    },
});
