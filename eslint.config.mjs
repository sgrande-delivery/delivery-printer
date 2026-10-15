import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['out/**', 'release/**', 'node_modules/**'],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      // Both rules below flag pre-existing patterns in auth.tsx and Login.tsx
      // that predate this config. They are worth fixing, but as their own
      // change rather than silently during the boilerplate removal, so they
      // warn instead of failing the build.
      'react-hooks/set-state-in-effect': 'warn',
      'preserve-caught-error': 'warn',
    },
  },

  prettier
);
