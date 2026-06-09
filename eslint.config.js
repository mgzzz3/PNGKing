import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/auto-imports.d.ts', 'src/components.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'], sourceType: 'module' },
      globals: globals.browser,
    },
    rules: { 'vue/multi-word-component-names': 'off' },
  },
  {
    files: ['**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
)
