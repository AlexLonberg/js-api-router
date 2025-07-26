import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, afterEach, test, expect } from 'vitest'
import { asyncPause, createServer } from 'nodejs-simple-http-server'
import { DATA_DIR, runServer } from '../tests/server.js'
import { WebSocketWrapper } from '../tests/WebSocketWrapper.js'
//
import { AbortError, ConfigureError } from '../errors.js'
import { JsonBufferCodec } from '../libs/JsonBufferCodec.js'
import { ChecksumVerifierXOR8 } from '../checksum/ChecksumVerifierXOR8.js'
import { ChecksumVerifierCRC32 } from '../checksum/ChecksumVerifierCRC32.js'
import { WebSocketConnector } from '../ws/WebSocketConnector.js'
import type { TMdpDecodedBinary, TMdpDecodedMessage, TMdpFileContainer, TMdpMessageOptions } from '../mdp/types.js'
import { MdpFramer } from '../mdp/MdpFramer.js'
import type { MdpEndpoint } from './MdpEndpoint.js'
import {
  MDP_ENDPOINT_EVENT_CODES,
  type TMdpEndpointEventCodes,
  type TMdpEndpointEventCode,
  type TMdpEndpointHandler,
  type TMdpDispatcherHandler,
  type MdpEndpointRequestContextLike
} from './types.js'
import { MdpEndpointDispatcher } from './MdpEndpointDispatcher.js'


type TFileMeta = { key: number, name: string, type: string, bin: any }

// # Службы для тестирования MFP

/**
 * Тест. Служба чата для тестирования {@link MfpEndpoint}.
 */
class TestChat {
  private readonly client: MdpEndpoint

  private readonly onMessage = async (type: TMdpEndpointEventCodes['message' | 'request' | 'binary' | 'open' | 'close' | 'error' | 'enable'], value: any) => {
    await asyncPause(100) // симуляция ожидания
    switch (type) {
      case MDP_ENDPOINT_EVENT_CODES.message:
        this.client.message({ data: { message: `Reply: ${value.data.message}` } })
        break
      default:
        this.client.message({ data: { message: 'Unclear' } })
    }
  }

  constructor(client: MdpEndpoint) {
    this.client = client
    client.changeHandler(this.onMessage)
  }
}

/**
 * Тест. Служба новостей для тестирования {@link MfpEndpoint}.
 */
class TestLatestNews {
  static readonly readonlyNews = [
    { post: 'A meteorite has fallen' },
    { post: 'Dinosaurs are not extinct' }
  ]

  private readonly news = TestLatestNews.readonlyNews.map((v) => ({ ...v }))
  private readonly client: MdpEndpoint

  private tid: ReturnType<typeof setInterval>
  private readonly emit = () => {
    this.client.message({
      data: this.news.splice(0, 1)[0]
    })
    if (this.news.length === 0) {
      clearInterval(this.tid)
      this.client.message({ data: { close: true }, needAck: false })
      this.client.close()
    }
  }

  constructor(client: MdpEndpoint, interval: number) {
    this.client = client
    this.tid = setInterval(this.emit, interval)
  }
}

class Requester {
  static async calculate (ctx: MdpEndpointRequestContextLike) {
    const params = ctx.message.data as { value1: number, value2: number, operation: '+' | '-' | '/' | '*' }
    // Симулируем задержку
    await asyncPause(100)
    try {
      const result = params.operation === '+'
        ? params.value1 + params.value2
        : params.operation === '-'
          ? params.value1 - params.value2
          : params.operation === '/'
            ? params.value1 / params.value2 // на / 0 мы должны получить невалидное число
            : params.value1 * params.value2
      if (!Number.isFinite(result)) throw 0
      ctx.reply({ data: { result } })
    } catch {
      ctx.reply({ error: { message: 'Операция завершилась неудачно' } })
    }
  }

  static multiple2file (ctx: MdpEndpointRequestContextLike) {
    const files = new Map()
    const codec = new JsonBufferCodec()
    for (const [key, file] of ctx.message.files!) {
      if (file.type === 'text/plain') {
        const text = codec.bufferToString(file.bin)
        files.set(key, { name: file.name, type: file.type, bin: codec.stringToBuffer(text + '\n' + text) })
      }
      else {
        const json = codec.bufferToJsonLike(file.bin)
        files.set(key, { name: file.name, type: file.type, bin: codec.jsonLikeToBuffer([json, json]) })
      }
    }
    ctx.reply({ data: 'Работа выполнена', files })
  }

  static async readAndReplyFiles (ctx: MdpEndpointRequestContextLike) {
    const bin1 = await readFile(join(DATA_DIR, 'example_png.png'))
    const bin2 = await readFile(join(DATA_DIR, 'example_jpg.jpg'))
    const bin3 = await readFile(join(DATA_DIR, 'example_webp.webp'))
    const message: TMdpMessageOptions<any> = {
      data: { message: 'Вот мои фотки' },
      files: new Map([
        [0, {
          name: 'example_png.png',
          type: 'image/png',
          bin: bin1
        }],
        [1, {
          name: 'example_jpg.jpg',
          type: 'image/jpeg',
          bin: bin2
        }],
        [2, {
          name: 'example_webp.webp',
          type: 'image/webp',
          bin: bin3
        }]
      ])
    }
    ctx.reply(message)
  }

  static exec (ctx: MdpEndpointRequestContextLike): void {
    // Здесь endpoint это команда
    if (ctx.endpoint === 'files.read') {
      Requester.readAndReplyFiles(ctx)
    }
    else if (ctx.endpoint === 'calculator') {
      Requester.calculate(ctx)
    }
    else if (ctx.endpoint === 'multiple2file') {
      Requester.multiple2file(ctx)
    }
    else {
      throw 0
    }
  }
}

class TestApp {
  private dispatcher: MdpEndpointDispatcher
  private expectedId: number = 0
  private expectedSet = new Set<number>()
  private expectedFiles = new Map<number, TFileMeta>()
  private streamingId: number = 0
  private streamingFiles = new Map<number, ArrayBuffer>()

  readonly _onEvent = (type: Exclude<TMdpEndpointEventCode, TMdpEndpointEventCodes['none']>, value: any) => {
    switch (type) {
      case MDP_ENDPOINT_EVENT_CODES.request: this.onRequest(value)
        break
      case MDP_ENDPOINT_EVENT_CODES.message: this.onMessage(value)
        break
      case MDP_ENDPOINT_EVENT_CODES.binary: this.onBinary(value)
        break
      case MDP_ENDPOINT_EVENT_CODES.open: this.onAllError()
        break
      case MDP_ENDPOINT_EVENT_CODES.close: this.onAllError()
        break
      case MDP_ENDPOINT_EVENT_CODES.error: this.onAllError()
        break
      case MDP_ENDPOINT_EVENT_CODES.unpack: this.onAllError()
        break
      case MDP_ENDPOINT_EVENT_CODES.unknown: this.onAllError()
        break
      default:
        this.onAllError()
    }
  }

  constructor(ws: WebSocketWrapper, protocol: string) {
    const xor8 = /xor8/i.test(protocol)
    this.dispatcher = new MdpEndpointDispatcher({
      url: ws.url,
      connector: ws,
      handler: this._onEvent,
      timeout: 0,
      checksumVerification: xor8 ? 2 : 1, // Для xor8 всегда добавляем контрольную сумму
      checksumVerifier: xor8 ? new ChecksumVerifierXOR8() : new ChecksumVerifierCRC32()
    })
  }

  onMessage (message: TMdpDecodedMessage<any>): void {
    // Запрос на создания службы новостей
    if (message.endpoint === 'service.news') {
      new TestLatestNews(this.dispatcher.endpoint('service.news'), 100)
    }
    // Запрос на создание службы чата
    else if (message.endpoint === 'service.chat') {
      new TestChat(this.dispatcher.endpoint('service.chat'))
    }
    // Обычная команда анонсирующая загрузку файлов
    else if (message.endpoint === 'files.upload') {
      // Вариант с ожидаемыми файлами
      if (message.expected) {
        this.expectedId = message.id
        this.expectedSet = message.expected
        this.expectedFiles = new Map((message.data as TFileMeta[]).map((meta) => [meta.key, meta]))
      }
      // Вариант с неопределенным количеством файлов
      else {
        this.streamingId = message.id
      }
    }
    else {
      this.dispatcher.message('error', { error: { message: 'Мы не ждали такого запроса', endpoint: message.endpoint } })
    }
  }

  onRequest (ctx: MdpEndpointRequestContextLike): void {
    try {
      Requester.exec(ctx)
    } catch (_) {
      this.dispatcher.message('error', { error: { message: 'Мы не ждали такого запроса', endpoint: ctx.endpoint } })
    }
  }

  onBinary (bin: TMdpDecodedBinary): void {
    if (this.expectedId === bin.refId) {
      if (bin.bin && this.expectedSet.delete(bin.key!)) {
        this.expectedFiles.get(bin.key!)!.bin = bin.bin
      }
      if (this.expectedSet.size === 0 || bin.final) {
        this.expectedId = 0
        this.dispatcher.message('files.copy', { files: this.expectedFiles, checksum: true })
      }
    }
    else if (this.streamingId === bin.refId) {
      if (bin.bin && !bin.final) {
        this.streamingFiles.set(bin.key!, bin.bin!)
      }
      else if (bin.final) {
        this.streamingId = 0
        const meta = this.dispatcher.framer.codec.bufferToJsonLike(bin.bin!) as TFileMeta[]
        const files = new Map<number, TFileMeta>()
        for (const item of meta) {
          item.bin = this.streamingFiles.get(item.key)
          files.set(item.key, item)
        }
        this.dispatcher.message('files.copy', { files, checksum: true })
      }
    }
  }

  onAllError (): void {
    // ...
  }

  close () {
    // ...
  }
}

beforeEach(async (ctx) => {
  const server = createServer({ noCache: true })
  await runServer(ctx, server, true)
  const wss = ctx.wssIns!

  wss.on('connection', function connection (ws) {
    const wsWrapper = new WebSocketWrapper(ws)
    const app = new TestApp(wsWrapper, ws.protocol)
    ws.once('close', () => { app.close() })
  })
})

afterEach((ctx) => {
  ctx.serverIns.close()
  ctx.wssIns?.close()
})

test('MdpEndpoint ping/pong', { timeout: 1000 }, async (ctx) => {
  const dispatcher = new MdpEndpointDispatcher(ctx.wssUrl)
  dispatcher.enable(true)
  await dispatcher.whenReady()

  const ok = await dispatcher.pingContext().ack()
  expect(ok).toBe(true)

  dispatcher.enable(false)
  const pong = await dispatcher.pingContext().ack()
  expect(pong).toBe(false)
})

test('MdpEndpointDispatcher + MdpEndpoint', { timeout: 1000 }, async (ctx) => {
  // Создаем диспетчер соединения
  const dispatcher = new MdpEndpointDispatcher({
    // Передадим сокет или адрес ws://site.com/*
    url: ctx.wssUrl,
    // можно передать два параметра или ссылку на готовый экземпляр
    mdpFramer: new MdpFramer({ checksumVerification: 1, checksumVerifier: new ChecksumVerifierCRC32() }),
    timeout: 300,
    checksumService: true
  })

  // Дождемся готовности соединения
  dispatcher.enable(true)
  expect(dispatcher.isEnabled()).toBe(true)
  expect(dispatcher.isConnected()).toBe(false)
  await dispatcher.whenReady()
  expect(dispatcher.isConnected()).toBe(true)

  const newsMessages: { post: string }[] = []
  const onNews: TMdpEndpointHandler<any> = (type: TMdpEndpointEventCode, value: any) => {
    if (type === MDP_ENDPOINT_EVENT_CODES.message) {
      const message = value as TMdpDecodedMessage<{ post: string, close?: true }>
      if (message.data!.close) {
        news.close() // Канал можно деактивировать enable(false) или полностью освободить
      }
      else {
        newsMessages.push(message.data!)
      }
    }
  }
  const chatMessages: string[] = []
  const onChat: TMdpEndpointHandler<any> = (type: TMdpEndpointEventCode, message: any) => {
    if (type === MDP_ENDPOINT_EVENT_CODES.message) {
      chatMessages.push((message as TMdpDecodedMessage<{ message: string }>).data!.message)
    }
  }

  // Резервируем конечные точки.
  // Новости придут сами по себе.
  const news = dispatcher.endpoint('service.news', onNews)
  // Как и в случае с основным диспетчером, обработчик можно заменить в любое время
  const chat = dispatcher.endpoint('service.chat')
  chat.changeHandler(onChat)
  // Попытка повторно получить контрольную точку завершиться ошибкой, пока она не освобождена
  expect(() => dispatcher.endpoint('service.news')).toThrow(ConfigureError)

  await news.message({ needAck: true })
  await chat.message({ needAck: true })

  // В параметры сообщений можно вложить любые файлы
  const result1 = await chat.message({ data: { message: 'Hello' }/*, files: new Map([]) */ })
  // Сообщения без опции needAck, вернет value:true, независимо было ли оно реально получено
  expect(result1).toMatchObject({ ok: true, value: { ack: true } })
  // Сообщения с опций needAck:true дожидаются подтверждений от стороны получателя сообщения
  const result2 = await chat.message({ data: { message: 'You are here' }, needAck: true, checksum: true })
  expect(result2).toMatchObject({ ok: true, value: { ack: true } })

  await asyncPause(500)

  // Эта контрольная точка была была освобождена news.close() и не может быть восстановлена без повторного получения
  expect(news.enabled).toBe(false)
  news.enable(true)
  expect(news.enabled).toBe(false)
  expect(dispatcher.hasEndpoint(news.endpoint)).toBe(false)
  const newEndpoint = dispatcher.endpoint(news.endpoint)
  newEndpoint.enable(true)
  expect(newEndpoint.enabled).toBe(true)

  expect(chat.enabled).toBe(true)
  expect(dispatcher.hasEndpoint(chat.endpoint)).toBe(true)

  // Проверим полученные сообщения
  expect(newsMessages).toStrictEqual(TestLatestNews.readonlyNews)
  expect(chatMessages).toStrictEqual(['Reply: Hello', 'Reply: You are here'])
})

test('MdpEndpoint calculator', { timeout: 1000 }, async (ctx) => {
  type TResult = { result: number, error?: null } | { result?: null, error: string }

  class RemoteCalculatorEndpoint {
    readonly endpoint: MdpEndpoint
    constructor(endpoint: MdpEndpoint) {
      this.endpoint = endpoint
    }
    private async request (value1: number, value2: number, operation: '+' | '-' | '*' | '/') {
      const message = await this.endpoint.request<{ result: number }>({
        data: { value1, value2, operation }
      })
      return message.value?.data ? { result: message.value.data.result } : { error: (message.value!.error as { message: string }).message }
    }
    add (value1: number, value2: number): Promise<TResult> {
      return this.request(value1, value2, '+')
    }
    subtract (value1: number, value2: number): Promise<TResult> {
      return this.request(value1, value2, '-')
    }
    multiply (value1: number, value2: number): Promise<TResult> {
      return this.request(value1, value2, '*')
    }
    divide (value1: number, value2: number): Promise<TResult> {
      return this.request(value1, value2, '/')
    }
  }

  // Создаем диспетчер соединения
  const dispatcher = new MdpEndpointDispatcher({
    url: ctx.wssUrl,
    checksumVerification: 1,
    checksumVerifier: new ChecksumVerifierCRC32(),
    timeout: 300,
    needAck: true,
    checksumService: true
  })
  dispatcher.enable(true)
  await dispatcher.whenReady()
  expect(dispatcher.isConnected()).toBe(true)

  // Выделяем конечную точку. В примере на сервере это просто запросы.
  const calculator = new RemoteCalculatorEndpoint(dispatcher.endpoint('calculator'))

  const result1 = await calculator.add(1, 2)
  expect(result1).toMatchObject({ result: 3 })

  const result2 = await calculator.subtract(7, 8)
  expect(result2).toMatchObject({ result: -1 })

  const result3 = await calculator.multiply(2, 4.5)
  expect(result3).toMatchObject({ result: 9 })

  const result4 = await calculator.divide(6, 3)
  expect(result4).toMatchObject({ result: 2 })

  const result5 = await calculator.divide(5, 0)
  expect(result5.result).toBeFalsy()
  expect(result5).toMatchObject({ error: 'Операция завершилась неудачно' })
})

test('MdpEndpoint multiple2file', { timeout: 1000 }, async (ctx) => {
  // Запрос обработки файлов
  const dispatcher = new MdpEndpointDispatcher({
    url: ctx.wssUrl,
    // Передадим собственный экземпляр ChecksumVerifierXOR8 и тип подпротокола 'xor8' для идентификации на сервере
    connector: new WebSocketConnector<'arraybuffer'>(ctx.wssUrl, {
      protocols: 'xor8',
      binaryType: 'arraybuffer'
    }),
    checksumVerification: 2, // всегда добавляем контрольную суму независимо от опций
    checksumVerifier: new ChecksumVerifierXOR8()
  })
  dispatcher.enable(true)
  await dispatcher.whenReady()

  // Запрос можно отправить по адресу контрольной точки или зарезервировать канал
  const endpoint = dispatcher.endpoint('multiple2file')

  const result = await endpoint.request({
    data: 'Умножь файлы на 2',
    files: new Map([[123, {
      name: 'text.txt',
      type: 'text/plain',
      bin: dispatcher.framer.codec.stringToBuffer('Text file.')
    }], [456, {
      name: 'config.json',
      type: 'application/json',
      bin: dispatcher.framer.codec.jsonLikeToBuffer({ foo: ['bar'] })
    }]])
  })

  expect(result.value).toMatchObject({
    data: 'Работа выполнена',
    files: new Map([[123, {
      name: 'text.txt',
      type: 'text/plain',
      bin: dispatcher.framer.codec.stringToBuffer('Text file.\nText file.').buffer // Приведем к ArrayBuffer
    }], [456, {
      name: 'config.json',
      type: 'application/json',
      bin: dispatcher.framer.codec.jsonLikeToBuffer([{ foo: ['bar'] }, { foo: ['bar'] }]).buffer
    }]])
  })
})

test('MdpEndpoint download/upload files', { timeout: 500_000 }, async (ctx) => {
  const dispatcher = new MdpEndpointDispatcher({
    url: ctx.wssUrl,
    mdpFramer: new MdpFramer({ checksumVerification: 1, checksumVerifier: new ChecksumVerifierCRC32() }),
    timeout: 300,
    checksumService: true
  })
  dispatcher.enable(true)
  await dispatcher.whenReady()

  // Соберем сюда копии файлов отправленные в третий раз
  const copiesOfFiles = new Map<number, TMdpFileContainer>()
  let resolve: (() => any)
  const promise = new Promise<void>((ok) => resolve = ok)

  // Обработчик необязательно устанавливать в параметры конструктора и можно заменить в любое время.
  // Обработчик принимает только те сообщения для которых явно не выделены конечные точки.
  // Выделенные конечные точки перенапрявляются в MfpEndpoint
  const handler: TMdpDispatcherHandler<any> = (type: TMdpEndpointEventCode, value: any) => {
    const message = value as TMdpDecodedMessage<any>
    if (type === MDP_ENDPOINT_EVENT_CODES.message && !message.error && message.endpoint === 'files.copy') {
      for (const [key, value] of message.files!) {
        copiesOfFiles.set(key, value)
      }
      if (copiesOfFiles.size === 3) {
        resolve()
      }
    }
  }
  dispatcher.changeHandler(handler)

  // Запрос файлов
  const files = await dispatcher.request('files.read', {/* Параметры необязательны */ })
  const file1 = files.value!.files!.get(0)!
  const file2 = files.value!.files!.get(1)!
  const file3 = files.value!.files!.get(2)!
  expect(file1.name).toEqual(expect.stringMatching('example'))
  expect(file2.type).toEqual(expect.stringMatching('image/'))
  expect(file3.bin).toBeInstanceOf(ArrayBuffer) // можно собрать из него Blob

  // Отправим анонсирующие сообщения и убедимся что они получены
  const expectedResult = await dispatcher.announce('files.upload', {
    data: [{ key: 0, name: file1.name, type: file1.type }],
    expected: new Set([0]),
    needAck: true
  })
  const announceCtx = dispatcher.announceContext('files.upload', { needAck: true })
  // // Удостоверимся в том что наши сообщения получены
  const pair = await Promise.all([Promise.resolve(expectedResult).then(({ value }) => value), announceCtx.ack()])
  expect(pair).toStrictEqual([expect.any(Object), true])

  // Если файлы были анонсированы ключами expected:Set() и уже все отправлены,
  // то контекст, в этом примере, финализируется сам без опции final:true

  // Пустой запрос так же корректен
  const ack0 = await dispatcher.binary({ refId: pair[0]!.refId, needAck: true })
  // Приложим файлы с теми же параметрами `id` запроса и `streaming`.
  // id первого варианта сообщения можно достать из сервисного сообщения подтверждения
  const ack1 = await dispatcher.binary({ refId: pair[0]!.refId, hasExpected: true, key: 0, bin: file1.bin, needAck: true })

  // Неограниченное количество файлов лучше обозначить в конце флагом final, при этом необязательно вкладывать файл.
  const ack2 = await dispatcher.binary({ refId: announceCtx.id, hasStreaming: true, key: 1, bin: file2.bin, needAck: true })
  const ack3_id = dispatcher.binaryLite({ refId: announceCtx.id, hasStreaming: true, key: 2, bin: file3.bin, checksum: true })
  // В этом примере отправим с последним запросом метаданные о файлах
  const meta = dispatcher.framer.codec.jsonLikeToBuffer([{ key: 1, name: file2.name, type: file2.type }, { key: 2, name: file3.name, type: file3.type }])
  const ack4 = await dispatcher.binary({ refId: announceCtx.id, hasData: true, bin: meta, final: true }) // сообщаем что файлы закончились
  expect(ack0.value && ack1.value && ack2.value && ack3_id && ack4.value).toBeTruthy()

  // Ожидаем последнего сообщения
  await promise
  // Файлы мы гоняли тута сюда три раза и они должны быть равны
  //  + files.read - прочитали с диска
  //  + files.upload binary() - отправили по одному обратно на сервер
  //  + files.copy onMessage() - опять перегнали на клиента
  expect(copiesOfFiles).toStrictEqual(files.value!.files!)
})

test('MdpEndpointDispatcher: simple request with needAck', { timeout: 1000 }, async (ctx_) => {
  const dispatcher = new MdpEndpointDispatcher(ctx_.wssUrl)
  dispatcher.enable(true)
  await dispatcher.whenReady()

  // Отправляем запрос. Первым придет сообщение подтверждения, но оно управляется протоклом и ответ придет позже
  const ctx = dispatcher.requestContext<{ result: number }>('calculator', { data: { value1: 1, value2: 2, operation: '+' }, needAck: true })
  // Получаем подтверждение ...
  expect(await ctx.ack()).toBe(true)
  // ... но это не значит что ответ уже готов, запрос обрабатывается приложением а не протоколом
  const maybeResult = ctx.result()
  expect(maybeResult).toBeInstanceOf(Promise)
  // Дожидаемся 100ms(симуляция в тестах)
  await asyncPause(500)
  // Скорее всего что Promise уже разрешен, и теперь result() возвратит результат
  const result = ctx.result() as any
  expect(result.value.data.result).toBe(3)

  // Отмена запроса, до наступления ответа
  const ctx2 = dispatcher.requestContext<{ result: number }>('calculator', { data: { value1: 1, value2: 2, operation: '+' }, needAck: true })
  expect(await ctx2.ack()).toBe(true)
  // Отменяем запрос, пока не успели прийти данные
  ctx2.abort()
  const result2 = await ctx2.result()
  expect(result2.error).toBeInstanceOf(AbortError)
})
