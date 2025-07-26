import { describe, test, expect, beforeEach } from 'vitest'
import { Middleware } from '../interfaces/MiddlewareLike.js'
import { type TEnvironmentOptions, Environment } from '../Environment.js'
import type { MiddlewareIterable } from '../middlewares/Middleware.js'
import { HttpRequestMiddleware } from '../middlewares/HttpRequestMiddleware.js'
import { type TEndpointOptionsConfig, BASE_MIDDLEWARE } from './types.js'
import {
  EndpointConfigBase,
  EndpointPresetConfig,
  EndpointOptionsConfig,
  EndpointConfig
} from './EndpointConfig.js'
import { EndpointHttpConfig } from './EndpointHttpConfig.js'
import { PathComponents } from './PathComponents.js'
import { UrlConfig } from './UrlConfig.js'
import {
  createEndpointPresetConfig,
  createEndpointOptionsConfig,
  // extendsEndpointConfigs,
  buildEndpointConfig
} from './utils.js'

// Расширим класс, чтобы иметь в комплекте корневой EndpointOptionsConfig
class EnvironmentImpl extends Environment {
  readonly config: EndpointOptionsConfig
  constructor(options?: undefined | null | TEnvironmentOptions, config?: undefined | null | EndpointOptionsConfig | TEndpointOptionsConfig) {
    super(options)
    if (config instanceof EndpointOptionsConfig) {
      this.config = config
    }
    else {
      this.config = createEndpointOptionsConfig(this, config ?? {})
    }
  }
}

function createTestMiddleware (kind: string) {
  return class extends Middleware<any, any> {
    static readonly kind = kind
    readonly kind = kind
    constructor() {
      super()
    }
  }
}

test('started', () => {
  // Самое главное определить путь, теперь эту конфигурацию можно расширять без ошибок
  const env = new EnvironmentImpl(null, { path: new UrlConfig('http://example.com') })

  // Пример
  const config1 = env.extendsOptionsConfig(env.config, { queueKey: 'q', queueLimit: 3, queuePriority: 5 })
  const config2 = env.extendsOptionsConfig(config1, { queueKey: null, queueLimit: false, queuePriority: 6, path: 'user' })

  expect(config1).toBeInstanceOf(EndpointOptionsConfig)
  expect(config2).toBeInstanceOf(EndpointOptionsConfig)

  expect(config2.queueKey).toBe('q') // унаследовано
  expect(config2.queueLimit).toBe(null) // затерто, так как false
  expect(config2.queuePriority).toBe(6) // переопределено на 6
  expect(config2.path?.toMutable().toString()).toBe('http://example.com/user') // расширено


})

test('ошибка при расширении PathComponents без базового UrlConfig', () => {
  const env = new EnvironmentImpl()

  expect(() =>
    env.extendsOptionsConfig(env.config, { path: new PathComponents('user', false) })
  ).toThrowError(/Целевой путь должен иметь базовый UrlConfig/)

  // ok
  expect(
    env.extendsOptionsConfig(env.config, { path: 'https://example.com' })
  ).toBeInstanceOf(EndpointOptionsConfig)
})

describe('Endpoint Config Extension', () => {
  let env: EnvironmentImpl

  beforeEach(() => {
    // Инициализация EnvironmentImpl только с базовым UrlConfig
    env = new EnvironmentImpl({
      requestInitExtendsMode: 1,
      headersExtendsMode: 1,
      headersAppendMode: 1,
      queryExtendsMode: 1,
      queryAppendMode: 1,
      hashExtendsMode: 1
    }, { path: new UrlConfig('http://example.com') })
  })

  test('наследование и переопределение базовых параметров', () => {
    const config1 = env.extendsOptionsConfig(env.config, { queueKey: 'q2', queueLimit: 3, queuePriority: 5, retries: 2 })
    const config2 = env.extendsOptionsConfig(config1, { queueKey: null, queueLimit: false, queuePriority: 6, retries: 3 })

    expect(config1).toBeInstanceOf(EndpointOptionsConfig)
    expect(config2).toBeInstanceOf(EndpointOptionsConfig)
    expect(config1.queueKey).toBe('q2')
    expect(config1.queueLimit).toBe(3)
    expect(config1.queuePriority).toBe(5)
    expect(config1.retries).toBe(2)
    expect(config2.queueKey).toBe('q2') // унаследовано
    expect(config2.queueLimit).toBeNull() // затёрто
    expect(config2.queuePriority).toBe(6) // переопределено
    expect(config2.retries).toBe(3) // переопределено
    expect(config2.path?.toMutable().toString()).toBe('http://example.com/')
  })

  test('отключение параметров с помощью false', () => {
    const config = env.extendsOptionsConfig(env.config, {
      retries: false,
      timeout: false,
      queueKey: false,
      queueUnordered: 0,
      queuePriority: false,
      queueLimit: false,
    })

    expect(config.retries).toBeNull()
    expect(config.timeout).toBeNull()
    expect(config.queueKey).toBeNull()
    expect(config.queueUnordered).toBe(0)
    expect(config.queuePriority).toBeNull()
    expect(config.queueLimit).toBeNull()
    expect(config.path?.toMutable().toString()).toBe('http://example.com/')
  })

  test('обработка middleware с BASE_MIDDLEWARE', () => {
    env.middlewareRegistry.register(createTestMiddleware('base'))
    env.middlewareRegistry.register(createTestMiddleware('custom'))
    const configBase = env.extendsOptionsConfig(env.config, { postprocessor: 'base' })
    const config = env.extendsOptionsConfig(configBase, {
      preprocessor: ['base'],
      postprocessor: ['custom', BASE_MIDDLEWARE],
    })

    expect(config.preprocessor?.ref.kind).toBe('base')
    const postprocessor = config.postprocessor?.ref
    expect(postprocessor).toBeTruthy()
    expect([...(postprocessor as MiddlewareIterable<any, any>)].map(m => m.kind)).toEqual(['custom', 'base'])
  })

  test('ошибка при дублировании BASE_MIDDLEWARE', () => {
    expect(() =>
      env.extendsOptionsConfig(env.config, {
        preprocessor: [BASE_MIDDLEWARE, BASE_MIDDLEWARE],
      })
    ).toThrowError(/Константа 'BASE_MIDDLEWARE' в наборе Middleware может быть определена только один раз/)
  })

  test('обработка path с разными типами', () => {
    const config1 = env.extendsOptionsConfig(env.config, { path: '/user///' })
    const config2 = env.extendsOptionsConfig(env.config, { path: new UrlConfig('http://new.example.com') })
    const config3 = env.extendsOptionsConfig(env.config, { path: new PathComponents('user/{id}', true) })

    expect(config1.path?.toMutable().toString()).toBe('http://example.com/user/')
    expect(config2.path?.toMutable().toString()).toBe('http://new.example.com/')
    const url = config3.path!.toMutable()!
    url.path.use({ id: 123 })
    expect(url.toString()).toBe('http://example.com/user/123')
  })

  test('обработка requestInit и headers', () => {
    const config = env.extendsOptionsConfig(env.config, {
      requestInit: { cache: 'no-cache', mode: 'cors' },
      headers: { 'X-Custom': 'custom' },
    })

    expect(config.requestInit?.requestInitBase).toEqual({ cache: 'no-cache', mode: 'cors' })
    expect(config.headers?.entries).toEqual([['X-Custom', 'custom']])
  })

  test('слияние requestInit и headers с базовой конфигурацией', () => {
    const baseConfig = env.extendsOptionsConfig(env.config, {
      requestInit: { cache: 'no-cache' },
      headers: { 'X-Base': 'base' },
    })
    const config = env.extendsOptionsConfig(baseConfig, {
      requestInit: { mode: 'cors' },
      headers: { 'X-Custom': 'custom' },
    })

    expect(config.requestInit?.requestInitBase).toEqual({ cache: 'no-cache', mode: 'cors' })
    expect(Object.fromEntries(config.headers!.entries)).toEqual({ 'X-Base': 'base', 'X-Custom': 'custom' })
  })

  test('отключение requestInit и headers', () => {
    const baseConfig = env.extendsOptionsConfig(env.config, {
      requestInit: { cache: 'no-cache' },
      headers: { 'X-Base': 'base' },
    })
    const config = env.extendsOptionsConfig(baseConfig, {
      requestInit: false,
      headers: false,
    })

    expect(config.requestInit).toBeNull()
    expect(config.headers).toBeNull()
  })

  test('обработка пресетов как строки', () => {
    const preset = env.presetConfig({
      kind: 'http',
      retries: 2
    })
    expect(preset).toBeInstanceOf(EndpointPresetConfig)
    env.presetRegistry.register('testPreset', preset)
    // Пресет только наследуется, но не раскрывается без функции buildEndpointConfig(). Развернем пресет
    const concreteConfig = buildEndpointConfig(env, 'CONFIG', {
      preset: 'testPreset',
      retries: 3,
    }, env.config)

    expect(concreteConfig.kind).toBe('http')
    expect(concreteConfig.retries).toBe(3)
  })

  test('отключение пресета', () => {
    const baseConfig = env.extendsOptionsConfig(env.config, { preset: { retries: 2 } })
    const config = env.extendsOptionsConfig(baseConfig, { preset: false })

    expect(config.preset).toBeNull()
    expect(config.retries).toBeNull()
  })

  test('обработка handler и target', () => {
    const handler = (_ok: boolean, _value: any, _error: any) => { /**/ }
    const target = { id: 'test', callback () { /**/ } }
    const config = env.extendsOptionsConfig(env.config, { handler, target })

    expect(config.handler).toBe(handler)
    expect(config.target).toBe(target)
  })

  test('обработка retryDelay как числа и функции', () => {
    const retryDelayFn = (attempt: number) => attempt * 1000
    const config1 = env.extendsOptionsConfig(env.config, { retryDelay: 500 })
    const config2 = env.extendsOptionsConfig(env.config, { retryDelay: retryDelayFn })

    expect(config1.retryDelay?.(1)).toBe(500)
    expect(config2.retryDelay).toBe(retryDelayFn)
  })

  test('buildEndpointConfig с пресетом и target', () => {
    env.presetRegistry.register('testPreset', createEndpointPresetConfig(env, {
      kind: 'http',
      retries: 2,
      executor: HttpRequestMiddleware,
    }))
    const baseConfig = env.config
    const config = { preset: 'testPreset', retries: 3, path: '/test' }

    const result = buildEndpointConfig(env, 'testKey', config, baseConfig) as EndpointHttpConfig<any>

    expect(result).toBeInstanceOf(EndpointConfigBase)
    expect(result).toBeInstanceOf(EndpointConfig)
    expect(result).toBeInstanceOf(EndpointHttpConfig)
    expect(result.kind).toBe('http')
    expect(result.retries).toBe(3)
    expect(result.url?.toMutable().toString()).toBe('http://example.com/test')
    expect(result.key).toBe('testKey')
    expect(result.context?.kind).toBe('http')
  })

  test('ошибка buildEndpointConfig с невалидным kind', () => {
    const config = { kind: 'invalid', path: '/test' }
    expect(() =>
      buildEndpointConfig(env, 'testKey', config, env.config)
    ).toThrowError(/Конструктор EndpointConfig "invalid" не зарегистрирован./)
  })

  test('ошибка buildEndpointConfig с невалидным config', () => {
    expect(() =>
      buildEndpointConfig(env, 'testKey', null as any, env.config)
    ).toThrowError(/Свойство конфигурации "testKey" должно быть объектом/)
  })
})
