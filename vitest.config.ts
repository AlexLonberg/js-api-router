/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
// import type { BrowserProviderOptions } from 'vitest/node'
// Здесь можно найти описание некоторых типов настроек playwright
// import { } from '@vitest/browser/providers/playwright'

// Конфигурация для тестирования в NodeJS
// Пример комментария для игнорирования @vitest/coverage-v8 https://vitest.dev/guide/coverage.html#ignoring-code
// правда в редакторе я не вижу эффекта.
// /* v8 ignore next 3 */

export default defineConfig({
  test: {
    // https://vitest.dev/config/#setupfiles
    include: [
      'src/**/*.test.ts'
    ],
    // globals: true
    // https://vitest.dev/guide/coverage.html
    coverage: {
      enabled: true,
      // Без этой опции использует корень проекта.
      include: ['src/**/*.ts'],
      provider: 'v8',
      reportsDirectory: '.temp/coverage'
    }
  }
})
