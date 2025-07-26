import { describe, test, expect, vi } from 'vitest'
import { HeadersConfig, MutableHeaders } from './HeadersConfig.js'
import type { THttpRequestMethod } from './types.js'
import {
  // requestInitBaseConfigProps,
  // type TRequestInitBaseCongigKey,
  type TRequestInitOptions,
  // type TRequestInitBaseOptions,
  type TReadonlyRequestInitBaseConfig,
  // type TRequestInitExtendsMode,
  requestInitBaseOptionsToEntries,
  requestInitBaseExtendsModeNew,
  requestInitBaseExtendsModeReplace,
  RequestInitConfig,
  MutableRequestInit
} from './RequestInitConfig.js'

// @ts-expect-error
interface TestMutableRequestInit extends MutableRequestInit {
  _refInit: TReadonlyRequestInitBaseConfig
  _body: null | BodyInit
  _headers: MutableHeaders
  _method: THttpRequestMethod
  _signal: null | AbortSignal
  _copied: boolean
}

describe('RequestInitConfig', () => {
  describe('requestInitBaseOptionsToEntries', () => {
    test('преобразует объект в массив пар', () => {
      const input: TRequestInitOptions = { cache: 'no-cache', credentials: 'same-origin', method: 'GET' }
      expect(requestInitBaseOptionsToEntries(input)).toStrictEqual([
        ['cache', 'no-cache'],
        ['credentials', 'same-origin'],
        ['method', 'GET']
      ])
    })

    test('игнорирует undefined/null значения', () => {
      const input = { cache: null, credentials: undefined, method: 'GET' }
      expect(requestInitBaseOptionsToEntries(input)).toStrictEqual([['method', 'GET']])
    })

    test('обрабатывает пустой или null/undefined вход', () => {
      expect(requestInitBaseOptionsToEntries(null)).toStrictEqual([])
      expect(requestInitBaseOptionsToEntries(undefined)).toStrictEqual([])
      expect(requestInitBaseOptionsToEntries({})).toStrictEqual([])
    })

    test('обрабатывает RequestInitConfig', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      expect(requestInitBaseOptionsToEntries(config)).toStrictEqual([['cache', 'no-cache']])
    })
  })

  describe('requestInitBaseExtendsModeNew', () => {
    test('заменяет параметры (mode 0)', () => {
      const base = Object.freeze({ cache: 'default', credentials: 'same-origin' })
      const custom: TRequestInitOptions = { cache: 'no-cache' }
      const result = requestInitBaseExtendsModeNew(base, custom)
      expect(result).toStrictEqual({ cache: 'no-cache' })
    })

    test('возвращает тот же объект, если параметры идентичны', () => {
      const base = Object.freeze({ cache: 'no-cache' })
      const custom: TRequestInitOptions = { cache: 'no-cache' }
      const result = requestInitBaseExtendsModeNew(base, custom)
      expect(result).toBe(base)
    })
  })

  describe('requestInitBaseExtendsModeReplace', () => {
    test('сливает параметры, сохраняя существующие (mode 1)', () => {
      const base = Object.freeze({ cache: 'default', credentials: 'same-origin' })
      const custom: TRequestInitOptions = { cache: 'no-cache', method: 'GET' }
      const result = requestInitBaseExtendsModeReplace(base, custom)
      expect(new Set(Object.keys(result))).toStrictEqual(new Set(['cache', 'credentials', 'method']))
      expect(result).toStrictEqual({ cache: 'no-cache', credentials: 'same-origin', method: 'GET' })
    })

    test('возвращает тот же объект, если параметры идентичны', () => {
      const base = Object.freeze({ cache: 'no-cache' })
      const custom: TRequestInitOptions = { cache: 'no-cache' }
      const result = requestInitBaseExtendsModeReplace(base, custom)
      expect(result).toBe(base)
    })

    test('возвращает base, если custom пустой', () => {
      const base = Object.freeze({ cache: 'no-cache' })
      const result = requestInitBaseExtendsModeReplace(base, null)
      expect(result).toBe(base)
    })
  })

  describe('RequestInitConfig class', () => {
    test('инициализирует с корректными параметрами', () => {
      const config = new RequestInitConfig({ cache: 'no-cache', credentials: 'same-origin' }, 1)
      expect(config.extendsMode).toBe(1)
      expect(config.requestInitBase).toStrictEqual({ cache: 'no-cache', credentials: 'same-origin' })
      expect(config.has('cache')).toBe(true)
      expect(config.get('cache')).toBe('no-cache')
    })

    test('инициализирует с пустыми параметрами', () => {
      const config = new RequestInitConfig(null, 0)
      expect(config.extendsMode).toBe(0)
      expect(config.requestInitBase).toStrictEqual({})
      expect(config.has('cache')).toBe(false)
      expect(config.get('cache')).toBeUndefined()
    })

    describe('extends with extendsMode 0 (no inheritance)', () => {
      test('заменяет параметры', () => {
        const config = new RequestInitConfig({ cache: 'default' }, 0)
        const result = config.extends({ credentials: 'same-origin' })
        expect(result.requestInitBase).toStrictEqual({ credentials: 'same-origin' })
      })

      test('возвращает тот же инстанс, если параметры идентичны', () => {
        const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
        const result = config.extends({ cache: 'no-cache' })
        expect(result).toBe(config)
      })
    })

    describe('extends with extendsMode 1 (merge)', () => {
      test('сливает параметры, сохраняя существующие', () => {
        const config = new RequestInitConfig({ cache: 'default', credentials: 'same-origin' }, 1)
        const result = config.extends({ cache: 'no-cache', method: 'GET' })
        expect(new Set(Object.keys(result.requestInitBase))).toStrictEqual(new Set(['cache', 'credentials', 'method']))
        expect(result.requestInitBase).toStrictEqual({
          cache: 'no-cache',
          credentials: 'same-origin',
          method: 'GET'
        })
      })

      test('возвращает тот же инстанс, если параметры идентичны', () => {
        const config = new RequestInitConfig({ cache: 'no-cache' }, 1)
        const result = config.extends({ cache: 'no-cache' })
        expect(result).toBe(config)
      })
    })

    test('обрабатывает extends с RequestInitConfig', () => {
      const config1 = new RequestInitConfig({ cache: 'default' }, 1)
      const config2 = new RequestInitConfig({ credentials: 'same-origin' }, 1)
      const result = config1.extends(config2)
      expect(new Set(Object.keys(result.requestInitBase))).toStrictEqual(new Set(['cache', 'credentials']))
      expect(result.requestInitBase).toStrictEqual({ cache: 'default', credentials: 'same-origin' })
    })
  })

  describe('MutableRequestInit class', () => {
    const createHeaders = () => {
      const headersConfig = new HeadersConfig(null, 0, 0)
      return new MutableHeaders({ map: headersConfig.map, entries: headersConfig.entries })
    }

    test('инициализирует с корректными параметрами', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)
      expect(init.cache).toBe('no-cache')
      expect(init.method).toBe('GET')
      expect(init.headers).toStrictEqual([])
      expect(init.body).toBeNull()
      expect(init.signal).toBeNull()
    })

    test('геттеры и сеттеры для базовых свойств', () => {
      const config = new RequestInitConfig(null, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)

      init.cache = 'no-cache'
      expect(init.cache).toBe('no-cache')

      init.credentials = 'same-origin'
      expect(init.credentials).toBe('same-origin')

      init.integrity = 'sha256-abc'
      expect(init.integrity).toBe('sha256-abc')

      init.keepalive = true
      expect(init.keepalive).toBe(true)

      init.mode = 'cors'
      expect(init.mode).toBe('cors')

      init.priority = 'high'
      expect(init.priority).toBe('high')

      init.redirect = 'follow'
      expect(init.redirect).toBe('follow')

      init.referrer = 'https://example.com'
      expect(init.referrer).toBe('https://example.com')

      init.referrerPolicy = 'no-referrer'
      expect(init.referrerPolicy).toBe('no-referrer')
    })

    test('удаляет свойства при установке null/undefined', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)
      init.cache = null
      expect(init.cache).toBeUndefined()
    })

    test('не изменяет, если значение совпадает', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers) as unknown as TestMutableRequestInit
      const originalRef = init._refInit
      init.cache = 'no-cache'
      expect(init._refInit).toBe(originalRef)
    })

    test('body устанавливается корректно', () => {
      const config = new RequestInitConfig(null, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'POST', headers)
      init.body = JSON.stringify({ data: 'test' })
      expect(init.body).toBe('{"data":"test"}')
      init.body = null
      expect(init.body).toBeNull()
    })

    test('игнорирует прямое изменение headers, method, signal', () => {
      const config = new RequestInitConfig(null, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {/**/ })

      init.headers = [['Content-Type', 'application/json']]
      expect(init.headers).toStrictEqual([])
      expect(consoleWarnSpy).toHaveBeenCalledWith("Несанкционированная попытка прямого изменения 'MutableRequestInit.headers'")

      init.method = 'POST'
      expect(init.method).toBe('GET')
      expect(consoleWarnSpy).toHaveBeenCalledWith("Несанкционированная попытка прямого изменения 'MutableRequestInit.method'")

      init.signal = new AbortController().signal
      expect(init.signal).toBeNull()
      expect(consoleWarnSpy).toHaveBeenCalledWith("Несанкционированная попытка прямого изменения 'MutableRequestInit.signal'")

      consoleWarnSpy.mockRestore()
    })

    test('_setAbortSignal устанавливает сигнал', () => {
      const config = new RequestInitConfig(null, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)
      const signal = new AbortController().signal
      init._setAbortSignal(signal)
      expect(init.signal).toBe(signal)
    })

    test('toCompatibleType возвращает this как RequestInit', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers)
      expect(init.toCompatibleType()).toBe(init)
    })

    test('_ensureCopy создает копию при изменении', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers) as unknown as TestMutableRequestInit
      const originalRef = init._refInit
      init.cache = 'default'
      expect(init._refInit).not.toBe(originalRef)
      expect(init._copied).toBe(true)
    })

    test('_ensureCopy не создает лишних копий', () => {
      const config = new RequestInitConfig({ cache: 'no-cache' }, 0)
      const headers = createHeaders()
      const init = new MutableRequestInit(config.requestInitBase, 'GET', headers) as unknown as TestMutableRequestInit
      init.cache = 'default'
      const copiedRef = init._refInit
      init.credentials = 'same-origin'
      expect(init._refInit).toBe(copiedRef)
    })
  })
})

test('native Request.signal: AbortSignal', () => {
  // Пример того что внутренний AbortSignal не ссылается на установленный пользователем
  const controlled = new AbortController()
  const req = new Request('http://foo.bar', { signal: controlled.signal })
  // По всей видимости сигнал оборачивается внутренним сигналом
  expect(req.signal).not.toBe(controlled.signal)
})
