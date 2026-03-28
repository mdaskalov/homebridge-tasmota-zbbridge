import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
    },

    rules: {
      quotes: ['warn', 'single'],
      indent: ['warn', 2, { SwitchCase: 1 }],
      semi: ['warn', 'always'],
      'comma-dangle': ['warn', 'always-multiline'],
      'dot-notation': 'off',
      eqeqeq: 'warn',
      curly: ['warn', 'all'],
      'brace-style': ['warn'],
      'prefer-arrow-callback': ['warn'],
      'max-len': ['warn', 140],
      'no-console': ['warn'],
      'no-non-null-assertion': ['off'],
      'comma-spacing': ['error'],
      'no-multi-spaces': ['warn', { ignoreEOLComments: true }],
      'lines-between-class-members': ['warn', 'always', { exceptAfterSingleLine: true }],
    },
  },
);