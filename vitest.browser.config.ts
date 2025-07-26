/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

// Конфигурация для тестирования в Chromium
export default defineConfig({
  test: {
    name: 'without-node',
    include: [
      'src/**/*.test.ts'
    ],
    exclude: [
      'src/Endpoints.test.ts',
      'src/mdc/MdpEndpoint.test.ts',
      'src/tests/mdpHttp.test.ts',
      'src/ws/WebSocketConnector.test.ts',
    ],
    browser: {
      enabled: true,
      provider: 'playwright',
      // viewport: { height: 100, width: 100 },
      // headless: true,
      instances: [{ browser: 'chromium' }]
    }
  }
})
