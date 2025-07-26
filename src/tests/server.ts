import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { TestContext } from 'vitest'
import { type SimpleHttpServer, type Response as SResponse, asyncPause } from 'nodejs-simple-http-server'
import { WebSocketServer } from 'ws'
import { MdpFramer } from '../mdp/MdpFramer.js'
import { MFP_FRAME_TYPES } from '../mfp/types.js'
import { nodeBufferToArrayBuffer } from './utils.js'
import type { TMdpDecodedRequest } from '../mdp/types.js'

function httpCalculate (framer: MdpFramer, message: TMdpDecodedRequest<{ value1: number, value2: number, operation: '+' | '-' | '/' | '*' }>, res: SResponse) {
  res.headers.set('content-type', 'mdp')
  const params = message.data!
  try {
    const result = params.operation === '+'
      ? params.value1 + params.value2
      : params.operation === '-'
        ? params.value1 - params.value2
        : params.operation === '/'
          ? params.value1 / params.value2 // на / 0 мы должны получить невалидное число
          : params.value1 * params.value2
    if (!Number.isFinite(result)) throw 0
    res.bodyEnd(Buffer.from(framer.encodeResponse('calculator', { refId: message.id, data: { result } })))
  } catch {
    res.bodyEnd(Buffer.from(framer.encodeResponse('calculator', { refId: message.id, error: { message: 'Операция завершилась неудачно' } })))
  }
}

/**
 * Определяет базовые маршруты сервера для тестов.
 *
 *  + `get /get_hello_world`
 *  + `get /api/get_json_hello_world`
 *  + `post /api/back_json`
 *  + `post /api/delay_and_back_json`
 *  + `post /api/throw_or_back_json`
 */
function initializeBasicRoutes (_ctx: TestContext, server: SimpleHttpServer) {
  const framer = new MdpFramer()

  server.get('/get_hello_world', async (_req, res) => {
    res.headers.type.text()
    res.body('Hello World!')
  })

  server.get('/api/get_json_hello_world', async (_req, res) => {
    res.bodyJson({ message: 'Hello World!' })
  })

  server.post('/api/back_json', async (req, res) => {
    const message = await req.readJson() as any
    if (typeof message.delay === 'number') {
      await asyncPause(message.delay)
    }
    res.bodyJson(message)
  })

  server.post('/api/delay_and_back_json', async (req, res) => {
    const message = await req.readJson() as any
    await asyncPause(message.delay)
    res.bodyJson(message)
  })

  server.post('/api/error_status_and_back_json', async (req, res) => {
    const message = await req.readJson() as any
    if (typeof message.delay === 'number') {
      await asyncPause(message.delay)
    }
    if (message.code !== 200) {
      res.headers.type.json()
      res.bodyFail(message.code, JSON.stringify(message))
    }
    else {
      res.bodyJson(message)
    }
  })

  server.post('api/mdp', async (req, res) => {
    const buff = await req.readBody()
    const message = framer.decode(nodeBufferToArrayBuffer(buff))
    if (message.type === MFP_FRAME_TYPES.request && message.endpoint === 'calculator') {
      httpCalculate(framer, message, res)
    }
    else {
      throw null
    }
  })
}

/**
 * Запустить сервер и установить парараметры контексту.
 */
async function runServer (ctx: TestContext, server: SimpleHttpServer, useWebSocket?: boolean): Promise<number> {
  const { hostname: _, port } = await server.listen()
  ctx.serverIns = server
  ctx.serverPort = port
  ctx.serverOrigin = `http://localhost:${port}`
  ctx.serverApiUrl = `http://localhost:${port}/api`
  ctx.wssUrl = `ws://localhost:${port}/ws`
  if (useWebSocket) {
    ctx.wssIns = new WebSocketServer({ server: server.server, path: '/ws' })
  }
  return port
}

const PROJECT_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const TEMP_DIR = join(PROJECT_DIR, '.temp')
const DATA_DIR = join(PROJECT_DIR, 'data')

export {
  initializeBasicRoutes,
  runServer,
  PROJECT_DIR,
  TEMP_DIR,
  DATA_DIR
}
