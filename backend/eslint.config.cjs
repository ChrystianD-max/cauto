// ESLint — C-AUTO backend (flat config, module 63 CI/CD).
// Gardé volontairement tolérant : l'objectif du lint dans le pipeline est de
// bloquer les erreurs STRUCTURELLES et les sources évidentes de bugs, pas de
// faire le procès du style. Types : JS pur, vérifié par typecheck (tsc).
'use strict';

const js = require('@eslint/js');

module.exports = [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js
        require: 'readonly', module: 'readonly', exports: 'writable',
        __dirname: 'readonly', __filename: 'readonly', process: 'readonly',
        console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        // Node 18+ fetch / URL
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        AbortController: 'readonly', AbortSignal: 'readonly', structuredClone: 'readonly'
      }
    },
    rules: {
      // Règles STRUCTURELLES = blocage. Tests + types : les vrais critical gates
      // sont les tests (voir workflow CI). Le style reste au niveau warning.
      'no-undef': 'error',
      'no-constant-binary-expression': 'error',
      'no-control-regex': 'error',
      'no-duplicate-imports': 'error',
      'no-import-assign': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-unreachable-loop': 'error',
      // Style / hygiène de codage : reporté, ne bloque pas le pipeline.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-promise-executor-return': 'warn',
      'no-unused-private-class-members': 'warn',
      'no-empty': 'warn',
      // Le code C-AUTO utilise legacy/async patterns assumés (console dans les
      // routes, expressions ternaires longues…) — pas de pénalité de style.
      'no-console': 'off',
      'no-unused-expressions': 'off'
    }
  },
  // Harnais de tests : accumulateurs (let b=''), globals Node 18 (FormData,
  // Blob), helpers importés inutilisés — patterns volontaires, pas de blocage.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        FormData: 'readonly', Blob: 'readonly', Headers: 'readonly',
        Request: 'readonly', Response: 'readonly', TextEncoder: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off'
    }
  }
];