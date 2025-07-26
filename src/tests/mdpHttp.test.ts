import { beforeEach, afterEach, test, expect } from 'vitest'
import { interfaceImplements } from 'ts-interface-core'
import {
  type TBinaryTransportReceiveHandler,
  type TBinaryTransportStateHandler,
  BinaryTransportLike
} from '../interfaces/BinaryTransportLike.js'
import type { ApiRouterError } from '../errors.js'
import { Endpoints } from '../Endpoints.js'
import { MdpEndpointDispatcher } from '../mdc/MdpEndpointDispatcher.js'
import type { TEndpointHttpConfig } from '../configs/EndpointHttpConfig.js'
import { uselessFunctionStub_ } from '../types.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'
import type { HttpContext } from '../contexts/HttpContext.js'
import { createServer, type Response as SResponse } from 'nodejs-simple-http-server'
import { runServer } from './server.js'
import { MdpFramer } from '../mdp/MdpFramer.js'
import { MFP_FRAME_TYPES } from '../mfp/types.js'
import type { TMdpDecodedRequest } from '../mdp/types.js'
import type { MdpEndpoint } from '../mdc/MdpEndpoint.js'
import { nodeBufferToArrayBuffer } from './utils.js'

// # Пример подмены Web-Socket обычными HTTP-запросами для протокола MFP+MDP

class BufferMiddleware extends Middleware<any, any> {
  static readonly kind = 'arrayBuffer'
  readonly kind = 'arrayBuffer'
  override process (_ctx: HttpContext<any, any>, response: Response): any {
    if (!(response.headers.get('content-type') ?? '').includes('mdp')) {
      throw null
    }
    return response.arrayBuffer()
  }
}

class HttpTransport extends Endpoints<'MDP_API'> implements BinaryTransportLike<ArrayBuffer, ArrayBuffer> {
  private _handler: TBinaryTransportReceiveHandler<string, ArrayBuffer> = uselessFunctionStub_
  readonly MDP_API: TEndpointHttpConfig = {
    path: 'api/mdp',
    postprocessor: BufferMiddleware,
    headers: { 'content-type': 'mdp' },
    handler: '_callback'
  }

  protected _callback (_ok: boolean, value: ArrayBuffer, _error: any) {
    this._handler('arraybuffer', value)
  }

  constructor(baseUrl: string) {
    super(null, { path: baseUrl, requestInit: { cache: 'no-cache' } }, true)
  }

  isEnabled (): boolean {
    return true
  }
  isConnected (): boolean {
    return true
  }
  enable (_enable: boolean): void {
    // ... не нуждается в реализации
  }
  changeStateHandler (_handler: TBinaryTransportStateHandler): void {
    // ... не нуждается в реализации
  }

  changeReceiveHandler (handler: TBinaryTransportReceiveHandler<string, ArrayBuffer>): void {
    this._handler = handler
  }

  sendOrThrow (data: ArrayBuffer): void {
    this.exec('MDP_API', { method: 'POST', data })
  }

  send (data: ArrayBuffer): undefined | ApiRouterError {
    this.exec('MDP_API', { method: 'POST', data })
    return undefined
  }
}
interfaceImplements(HttpTransport, BinaryTransportLike)

beforeEach(async (ctx) => {
  const server = createServer({ noCache: true })
  const framer = new MdpFramer()

  function calculate (message: TMdpDecodedRequest<{ value1: number, value2: number, operation: '+' | '-' | '/' | '*' }>, res: SResponse) {
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

  server.post('api/mdp', async (req, res) => {
    const buff = await req.readBody()
    const message = framer.decode(nodeBufferToArrayBuffer(buff))
    if (message.type === MFP_FRAME_TYPES.request && message.endpoint === 'calculator') {
      calculate(message, res)
    }
    else {
      throw null
    }
  })

  await runServer(ctx, server, false)
})

afterEach((ctx) => {
  ctx.serverIns.close()
})

test('HttpTransport', { timeout: 100_000 }, async (ctx) => {
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
      return message.value?.data
        ? { result: message.value.data.result }
        : { error: (message.value!.error as { message: string }).message }
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

  // Фейковый WebSocket
  const dispatcher = new MdpEndpointDispatcher({ url: `${ctx.serverOrigin}/api/mdp`, connector: new HttpTransport(ctx.serverOrigin) })

  // Выделяем конечную точку. В примере на сервере это просто HTTP-POST-запросы.
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
