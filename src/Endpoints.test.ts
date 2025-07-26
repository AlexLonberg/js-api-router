import { test, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'nodejs-simple-http-server'
import { initializeBasicRoutes, runServer } from './tests/server.js'
import { headersSet } from './configs/headersSet.js'
import type { TEndpointHttpConfig } from './configs/EndpointHttpConfig.js'
import type { TResponse } from './types.js'
import type { Environment } from './Environment.js'
import type { ContextLike } from './interfaces/ContextLike.js'
import { Middleware } from './interfaces/MiddlewareLike.js'
import { Endpoints } from './Endpoints.js'

beforeEach(async (ctx) => {
  const server = createServer({ noCache: true })
  initializeBasicRoutes(ctx, server)
  await runServer(ctx, server)
})

afterEach((ctx) => {
  ctx.serverIns.close()
  ctx.wssIns?.close()
})

test('ApiRouter: Endpoints', async (ctx) => {
  // Определение классов конечных точек
  class EndpointsImpl extends Endpoints<'GET_HELLO' | 'BACK_DATA' | 'JOKE'> {
    readonly GET_HELLO: TEndpointHttpConfig = {
      path: 'get_hello_world',
      postprocessor: 'TextResponseMiddleware' // есть в списке по умолчанию
    }

    readonly BACK_DATA: TEndpointHttpConfig = {
      path: 'api/back_json',
      preset: 'jsonPreset'
    }

    readonly JOKE: TEndpointHttpConfig = {
      path: 'api/back_json',
      preset: 'jsonPresetJoke'
    }

    constructor(baseUrl: string) {
      // 1 - Первый параметр это класс Environment и его необязательно устанавливать
      // 2 - Второй параметр это обобщенный EndpointOptionsConfig, который определит базовые параметры
      super(null, { path: baseUrl, requestInit: { cache: 'no-cache' } })
    }

    get environment (): Environment {
      return this._internalEnvironment
    }

    getHello (): Promise<TResponse<string>> {
      return this.exec('GET_HELLO', { method: 'GET' })
    }

    backData<T extends Record<string, any>> (data: Record<string, any>): Promise<TResponse<T>> {
      return this.exec('BACK_DATA', { method: 'POST', data })
    }

    backJoke<T extends Record<string, any>> (data: Record<string, any>): Promise<TResponse<T>> {
      return this.exec('JOKE', { method: 'POST', data })
    }
  }

  const endpoints = new EndpointsImpl(ctx.serverOrigin)
  // Зарегистрируем preset до первого вызова get/post
  const jsonPreset = endpoints.environment.presetConfig({
    headers: headersSet.contentType.json.kv,
    postprocessor: 'JsonResponseMiddleware' // есть в списке по умолчанию
  }, 'jsonPreset')

  class JokeMiddleware extends Middleware<any, any> {
    static kind = 'JokeMiddleware'
    kind = 'JokeMiddleware'
    override process (_ctx: ContextLike, value: any) {
      value.joke = 'You filthy brute'
      return value
    }
  }

  // Расширяем пресет дополнительным preprocessor
  const jsonPresetJoke = endpoints.environment.extendsPresetConfig(jsonPreset, { preprocessor: JokeMiddleware })
  endpoints.environment.presetRegistry.register('jsonPresetJoke', jsonPresetJoke)

  const { ok, value, error } = await endpoints.getHello()
  expect(ok).toBe(true)
  expect(value).toStrictEqual('Hello World!')
  expect(error).toBeFalsy()

  const { ok: ok1, value: value1, error: error1 } = await endpoints.backData({ message: 'Hello World!' })
  expect(ok1).toBe(true)
  expect(value1).toStrictEqual({ message: 'Hello World!' })
  expect(error1).toBeFalsy()

  const { ok: ok2, value: value2, error: error2 } = await endpoints.backJoke({ message: 'Hello World!' })
  expect(ok2).toBe(true)
  expect(value2).toStrictEqual({ message: 'Hello World!', joke: 'You filthy brute' })
  expect(error2).toBeFalsy()
})
