// import type { TestContext } from 'vitest'
import type { WebSocketServer } from 'ws'
import type { SimpleHttpServer } from 'nodejs-simple-http-server'

// Определения для тестов. Пример:
// test('test name', { timeout: 10_000 }, async (ctx) => {
//   const baseUrl = `${ctx.serverOrigin}/api`
// })
declare module '@vitest/runner' {
  interface TestContext {
    /**
     * Экземпляр сервера, который должен быть закрыт в конце теста {@link SimpleHttpServer.close()}.
     */
    serverIns: SimpleHttpServer
    /**
     * Порт сервера, который может быть использован в шаблоне `http://localhost:{serverPort}/your/path`.
     */
    serverPort: number
    /**
     * Адрес вида `'http://localhost:1234'` без последнего слеша.
     */
    serverOrigin: string
    /**
     * Адрес вида `'http://localhost:1234/api'` симулирующий базовый Api-URL.
     */
    serverApiUrl: string
    /**
     * Экземпляр `WebSocketServer` с установленным путем `'localhost:1234/ws'`
     */
    wssIns?: WebSocketServer
    /**
     * Путь `'ws://localhost:1234/ws'`
     */
    wssUrl: string
  }
}
