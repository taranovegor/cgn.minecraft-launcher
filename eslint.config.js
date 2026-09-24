const js = require('@eslint/js')
const globals = require('globals')

const baseRules = {
    ...js.configs.recommended.rules,
    indent: ['error', 4, { SwitchCase: 1 }],
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single', { allowTemplateLiterals: true }],
    semi: ['error', 'never'],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-var': ['error'],
    'no-console': [0],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-control-regex': [0],
    'no-unused-vars': ['error', {
        vars: 'all',
        args: 'none',
        caughtErrors: 'none',
        ignoreRestSiblings: false,
        argsIgnorePattern: 'reject'
    }],
    'no-redeclare': ['error', { builtinGlobals: false }],
    'preserve-caught-error': [0],
    'no-useless-assignment': [0],
    'no-unassigned-vars': [0],
    'no-async-promise-executor': [0]
}

module.exports = [
    {
        ignores: ['dist/**', 'node_modules/**', '**/*.d.ts']
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        },
        rules: baseRules
    },
    {
        files: ['app/assets/js/scripts/*.js'],
        languageOptions: {
            globals: { ...globals.browser }
        },
        rules: {
            'no-unused-vars': [0],
            'no-undef': [0]
        }
    }
]
