/**
 * ESLint v9+ flat config.
 *
 * This project previously used `.eslintrc.json`.
 * ESLint v9 no longer auto-loads .eslintrc.* configs, so we provide this
 * minimal flat config equivalent.
 */

module.exports = [
    // Server-side Node scripts
    {
        files: ["**/*.js"],
        ignores: [
            "public/js/vue.global.js",
            "uploads/**"
        ],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "script",
            globals: {
                // Node globals
                module: "readonly",
                require: "readonly",
                process: "readonly",
                __dirname: "readonly",
                console: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off"
        }
    },

    // Vitest / test files (ESM)
    {
        files: ["tests/**/*.js", "vitest.config.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off"
        }
    },

    // Frontend ESM files
    {
        files: ["public/js/**/*.js", "src/**/*.js", "idle-timeout.js"],
        ignores: ["public/js/vue.global.js"],
        languageOptions: {
            // Allow top-level await and modern syntax used by ESM.
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                window: "readonly",
                document: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",
                fetch: "readonly",
                console: "readonly"
            }
        },
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off"
        }
    }
];
