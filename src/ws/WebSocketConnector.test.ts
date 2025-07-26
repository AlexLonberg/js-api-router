import { test, expect, beforeEach, afterEach } from 'vitest'
import type { RawData } from 'ws'
import { createServer } from 'nodejs-simple-http-server'
import { initializeBasicRoutes, runServer } from '../tests/server.js'
import { type TBinaryTransportEventName, BINARY_TRANSPORT_EVENT_NAMES } from '../interfaces/BinaryTransportLike.js'
import {
  // webSocketMessageTypes,
  type TWebSocketMessageType,
  // type UWebSocketMessageTypeOf,
  // type TWsReceiveHandler,
  // type TWsStateHandler,
  // type TWebSocketConnectorOptions
} from '../ws/types.js'
import { WebSocketConnector as WebSocketConnector_ } from '../ws/WebSocketConnector.js'

// Добавим тестовые методы
class WebSocketConnector<T extends TWebSocketMessageType> extends WebSocketConnector_<T> {
  async _onlyDevelopmentSimulateError (ms = 100): Promise<void> {
    // Отправляем серверу команду для симуляции ошибки и закрытия соединения
    this._socket?.send('simulateError')
    await new Promise((ok) => setTimeout(ok, ms))
  }
}

beforeEach(async (ctx) => {
  const server = createServer({ noCache: true })
  initializeBasicRoutes(ctx, server)

  await runServer(ctx, server, true)
  const wss = ctx.wssIns!

  wss.on('connection', function connection (ws) {
    ws.on('error', console.error.bind(console))
    ws.on('message', function message (data: RawData, _isBinary: boolean) {
      const some = data.toString()
      if (some === 'simulateError') {
        ws.close()
      }
      else {
        ws.send(some)
      }
    })
  })
})

afterEach((ctx) => {
  ctx.serverIns.close()
  ctx.wssIns?.close()
})

test('WebSocketConnector: WebSocket', async (ctx) => {
  const wsUrl = `ws://localhost:${ctx.serverPort}/ws`

  const result: any[] = []
  let resolve: () => any
  const promise = new Promise<void>((ok) => resolve = ok)
  function onMessage (type: TWebSocketMessageType, message: string) {
    result.push(type, message)
    if (result.length >= 6) {
      resolve()
    }
  }

  const connector = new WebSocketConnector(wsUrl, { binaryType: 'string', receiveHandler: onMessage })
  connector.enable(true)
  expect(await connector.whenReady()).toBe(true)

  connector.send('1')
  connector.send('2')
  connector.send('3')

  await promise
  connector.enable(false)
  expect(await connector.whenReady()).toBe(false)

  expect(result).toStrictEqual(['string', '1', 'string', '2', 'string', '3'])
})

test('WebSocketConnector: Simulate Error', async (ctx) => {
  const wsUrl = `ws://localhost:${ctx.serverPort}/ws`

  const state: any[] = []
  const result: any[] = []
  let resolve1: () => any
  let resolve2: () => any
  let resolve3: () => any
  const promise1 = new Promise<void>((ok) => resolve1 = ok)
  const promise2 = new Promise<void>((ok) => resolve2 = ok)
  const promise3 = new Promise<void>((ok) => resolve3 = ok)
  function onMessage (type: TWebSocketMessageType, message: string) {
    result.push(type, message)
    if (result.length === 2) {
      resolve1()
    }
    if (result.length === 4) {
      resolve2()
    }
    if (result.length >= 6) {
      resolve3()
    }
  }

  const connector = new WebSocketConnector(wsUrl, {
    binaryType: 'string',
    retryDelay: 500,
    retries: 2,
    receiveHandler: onMessage,
    stateHandler: (type: TBinaryTransportEventName, _?: any) => state.push(type)
  })
  connector.enable(true)
  expect(await connector.whenReady()).toBe(true)

  connector.send('1')
  // Слегка подождем перед симуляцией ошибки, чтобы  первое сообщение успело прийти обратно
  await promise1
  await connector._onlyDevelopmentSimulateError()
  expect(await connector.whenReady()).toBe(true)
  // !!! Ошибка сокета не возвращает событий 'close', а только сигнализирует об ошибке.
  //     Событие 'close' будет вызвано когда не осталось попыток и WebSocketConnector.enabled === false
  //     Попросту говоря, событие 'error' означает что соединение скорее всего разорвано.
  expect(state).toStrictEqual([
    BINARY_TRANSPORT_EVENT_NAMES.open,
    BINARY_TRANSPORT_EVENT_NAMES.error,
    BINARY_TRANSPORT_EVENT_NAMES.open
  ])
  connector.send('2')
  await promise2

  // Быстрое отключение и включение
  connector.enable(false)
  connector.enable(true)
  await connector.whenReady()

  connector.send('3')
  await promise3
  connector.enable(false)
  expect(await connector.whenReady()).toBe(false)

  expect(result).toStrictEqual(['string', '1', 'string', '2', 'string', '3'])
  expect(state).toStrictEqual([
    BINARY_TRANSPORT_EVENT_NAMES.open,
    BINARY_TRANSPORT_EVENT_NAMES.error,
    BINARY_TRANSPORT_EVENT_NAMES.open,
    BINARY_TRANSPORT_EVENT_NAMES.close,
    BINARY_TRANSPORT_EVENT_NAMES.open,
    BINARY_TRANSPORT_EVENT_NAMES.close
  ])
})
