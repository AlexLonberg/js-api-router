import { describe, test, expect, vi } from 'vitest'
import { PathComponents } from './PathComponents.js'
import { UrlQueryParams } from './UrlQueryParams.js'
import {
  // type TUrlHashExtendsMode,
  type TUrlExtendsOptions,
  type TNormalizedUrlComponents,
  type TUrlFragments,
  type TUrlConfigOptions,
  normalizeUrlExtendsOptions,
  parsedUrlOrNull,
  urlOriginOrNull,
  urlHashOrNull,
  normalizeUrlComponents,
  urlComponentsOrThrow,
  UrlConfig,
  MutableUrl,
  // type TUrlComponents,
  // useUrlComponents
} from './UrlConfig.js'

describe('URL Utilities', () => {
  describe('normalizeUrlExtendsOptions', () => {
    test('нормализует опции с пользовательскими значениями', () => {
      const options: TUrlConfigOptions = { queryExtendsMode: 1, queryAppendMode: 1, hashExtendsMode: 1 }
      const result = normalizeUrlExtendsOptions(options)
      expect(result).toStrictEqual({
        queryExtendsMode: 1,
        queryAppendMode: 1,
        hashExtendsMode: 1,
      })
      expect(Object.isFrozen(result)).toBe(true)
    })

    test('использует значения по умолчанию для некорректных опций', () => {
      const options: TUrlConfigOptions = { queryExtendsMode: 3 as any, queryAppendMode: 2 as any, hashExtendsMode: 2 as any }
      const result = normalizeUrlExtendsOptions(options)
      expect(result).toStrictEqual({
        queryExtendsMode: 0,
        queryAppendMode: 0,
        hashExtendsMode: 0,
      })
    })

    test('обрабатывает null/undefined', () => {
      expect(normalizeUrlExtendsOptions(null)).toStrictEqual({
        queryExtendsMode: 0,
        queryAppendMode: 0,
        hashExtendsMode: 0,
      })
    })
  })

  describe('parsedUrlOrNull', () => {
    test('парсит валидный URL', () => {
      const url = parsedUrlOrNull('https://example.com/path?foo=bar#hash')
      expect(url).toBeInstanceOf(URL)
      expect(url?.toString()).toBe('https://example.com/path?foo=bar#hash')
    })

    test('возвращает null для невалидного URL', () => {
      expect(parsedUrlOrNull('not-a-url')).toBeNull()
    })
  })

  describe('urlOriginOrNull', () => {
    test('возвращает origin для валидного URL', () => {
      expect(urlOriginOrNull('https://example.com/path')).toBe('https://example.com')
    })

    test('возвращает null для невалидного URL', () => {
      expect(urlOriginOrNull('not-a-url')).toBeNull()
    })
  })

  describe('urlHashOrNull', () => {
    test('очищает хэш от ведущих решеток', () => {
      expect(urlHashOrNull('###hash')).toBe('hash')
      expect(urlHashOrNull('hash')).toBe('hash')
      expect(urlHashOrNull('')).toBeNull()
      expect(urlHashOrNull(null)).toBeNull()
      expect(urlHashOrNull(undefined)).toBeNull()
    })
  })

  describe('normalizeUrlComponents', () => {
    test('обрабатывает строку URL', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const result = normalizeUrlComponents('https://example.com/path?foo=bar#hash', options)
      expect(result.origin).toBe('https://example.com')
      expect(result.path).toBeInstanceOf(PathComponents)
      expect(result.path?.toMutable().toString()).toBe('path')
      expect(result.query).toBeInstanceOf(UrlQueryParams)
      expect(result.query?.toString()).toBe('foo=bar')
      expect(result.hash).toBe('hash')
    })

    test('обрабатывает объект URL', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const url = new URL('https://example.com/path?foo=bar#hash')
      const result = normalizeUrlComponents(url, options)
      expect(result.origin).toBe('https://example.com')
      expect(result.path?.toMutable().toString()).toBe('path')
      expect(result.query?.toString()).toBe('foo=bar')
      expect(result.hash).toBe('hash')
    })

    test('обрабатывает PathComponents', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const path = new PathComponents('/path', false)
      const result = normalizeUrlComponents(path, options)
      expect(result.origin).toBeNull()
      expect(result.path).toBe(path)
      expect(result.query).toBeNull()
      expect(result.hash).toBeNull()
    })

    test('обрабатывает TUrlFragments', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const input = { origin: 'https://example.com', path: '/path', query: 'foo=bar', hash: 'hash' }
      const result = normalizeUrlComponents(input, options)
      expect(result.origin).toBe('https://example.com')
      expect(result.path?.toMutable().toString()).toBe('path')
      expect(result.query?.toString()).toBe('foo=bar')
      expect(result.hash).toBe('hash')
    })

    test('обрабатывает null/undefined', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const result = normalizeUrlComponents(null, options)
      expect(result).toStrictEqual({ origin: null, path: null, query: null, hash: null })
    })
  })

  describe('urlComponentsOrThrow', () => {
    test('возвращает компоненты для валидного URL', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      const result: TNormalizedUrlComponents = urlComponentsOrThrow('https://example.com/path?foo=bar#hash', options)
      expect(result.origin).toBe('https://example.com')
      expect(result.path.toMutable().toString()).toBe('path')
      expect(result.query.toString()).toBe('foo=bar')
      expect(result.hash).toBe('hash')
    })

    test('выбрасывает ошибку для невалидного URL', () => {
      const options: Omit<TUrlExtendsOptions, 'hashExtendsMode'> = { queryExtendsMode: 0, queryAppendMode: 0 }
      expect(() => urlComponentsOrThrow('not-a-url', options)).toThrowError(/Аргумент 'url' должен содержать абсолютный URL с протоколом/)
    })
  })

  describe('UrlConfig', () => {
    test('инициализирует с валидным URL', () => {
      const config = new UrlConfig('https://example.com/path?foo=bar#hash')
      expect(config.origin).toBe('https://example.com')
      expect(config.path.toMutable().toString()).toBe('path')
      expect(config.query.toString()).toBe('foo=bar')
      expect(config.hash).toBe('hash')
      expect(config.extendsOptions).toStrictEqual({
        queryExtendsMode: 0,
        queryAppendMode: 0,
        hashExtendsMode: 0,
      })
    })

    test('инициализирует с TUrlFragments', () => {
      const components: TUrlFragments & { origin: string } = { origin: 'https://example.com', path: '/path', query: 'foo=bar', hash: 'hash' }
      const config = new UrlConfig(components)
      expect(config.origin).toBe('https://example.com')
      expect(config.path.toMutable().toString()).toBe('path')
      expect(config.query.toString()).toBe('foo=bar')
      expect(config.hash).toBe('hash')
    })

    test('isEmpty возвращает true для пустого URL', () => {
      const config = new UrlConfig('https://example.com')
      expect(config.path.hasStartSlash).toBe(true)
      expect(config.isEmpty()).toBe(false)
      // Путь будет проигнорирован, в том числе и слеш
      const empty = new UrlConfig({ origin: 'https://example.com/foo' })
      expect(empty.isEmpty()).toBe(true)
    })

    test('isEmpty возвращает false для непустого URL', () => {
      const config = new UrlConfig('https://example.com/path?foo=bar#hash')
      expect(config.isEmpty()).toBe(false)
    })

    describe('extends with queryExtendsMode 0 and hashExtendsMode 0', () => {
      test('расширяет с помощью строки пути', () => {
        const config = new UrlConfig('https://example.com/path', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const result = config.extends('/newpath')
        expect(result.origin).toBe('https://example.com')
        expect(result.path.toMutable().toString()).toBe('path/newpath')
        expect(result.query.toString()).toBe('')
        expect(result.hash).toBeNull()
      })

      test('расширяет с помощью PathComponents', () => {
        const config = new UrlConfig('https://example.com/path', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const path = new PathComponents('/newpath', false)
        const result = config.extends(path)
        expect(result.path.toMutable().toString()).toBe('path/newpath')
      })

      test('заменяет при абсолютном URL', () => {
        const config = new UrlConfig('https://example.com/path?foo=bar#hash', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const result = config.extends('https://new.com/newpath?baz=qux#newhash')
        expect(result.origin).toBe('https://new.com')
        expect(result.path.toMutable().toString()).toBe('newpath')
        expect(result.query.toString()).toBe('baz=qux')
        expect(result.hash).toBe('newhash')
      })

      test('расширяет с помощью TUrlFragments', () => {
        const config = new UrlConfig('https://example.com/path?foo=bar#hash', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const result = config.extends({ path: '/newpath', query: 'baz=qux', hash: 'newhash' })
        expect(result.origin).toBe('https://example.com')
        expect(result.path.toMutable().toString()).toBe('path/newpath')
        expect(result.query.toString()).toBe('baz=qux')
        expect(result.hash).toBe(null)
      })

      test('возвращает this при пустом компоненте', () => {
        const config = new UrlConfig('https://example.com')
        const result = config.extends(null)
        expect(result).toBe(config)
      })
    })

    describe('extends with queryExtendsMode 1 and hashExtendsMode 1', () => {
      test('наследует query и hash', () => {
        const config = new UrlConfig('https://example.com/path?foo=bar#hash', { queryExtendsMode: 1, queryAppendMode: 0, hashExtendsMode: 1 })
        const result = config.extends({ path: '/newpath' })
        expect(result.origin).toBe('https://example.com')
        expect(result.path.toMutable().toString()).toBe('path/newpath')
        expect(result.query.toString()).toBe('foo=bar')
        expect(result.hash).toBe('hash')
      })
    })

    describe('extends with UrlConfig', () => {
      test('заменяет при совпадающих extendsOptions', () => {
        const config1 = new UrlConfig('https://example.com/path', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const config2 = new UrlConfig('https://new.com/newpath')
        const result = config1.extends(config2)
        expect(result.origin).toBe('https://new.com')
        expect(result.path.toMutable().toString()).toBe('newpath')
      })

      test('предупреждает и заменяет extendsOptions при несовпадении', () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {/**/ })
        const config1 = new UrlConfig('https://example.com/path', { queryExtendsMode: 1, queryAppendMode: 0, hashExtendsMode: 0 })
        const config2 = new UrlConfig('https://new.com/newpath', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
        const result = config1.extends(config2)
        expect(result.extendsOptions).toStrictEqual({ queryExtendsMode: 1, queryAppendMode: 0, hashExtendsMode: 0 })
        expect(result.origin).toBe('https://new.com')
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[UrlConfig] Пользовательские опции расширения маршрута должны совпадать с текущим UrlConfig, this/custom:',
          config1.extendsOptions,
          config2.extendsOptions
        )
        consoleWarnSpy.mockRestore()
      })
    })

    describe('toWsUrl', () => {
      test('конвертирует http(s) в ws(s)', () => {
        const config = new UrlConfig('https://example.com/path?foo=bar#hash')
        const result = config.toWsUrl(false)
        expect(result.origin).toBe('wss://example.com')
        expect(result.path.toMutable().toString()).toBe('path')
        expect(result.query.toString()).toBe('foo=bar')
        expect(result.hash).toBe(null)
      })

      test('возвращает this для ws(s) протокола', () => {
        const config = new UrlConfig('ws://example.com')
        const result = config.toWsUrl(false)
        expect(result).toBe(config)
      })

      test('очищает путь, query и hash при onlyOrigin', () => {
        const config = new UrlConfig('https://example.com/path?foo=bar#hash')
        const result = config.toWsUrl(true)
        expect(result.origin).toBe('wss://example.com')
        expect(result.path.toMutable().toString()).toBe('')
        expect(result.query.toString()).toBe('')
        expect(result.hash).toBeNull()
      })
    })
  })

  describe('MutableUrl', () => {
    test('инициализирует с UrlConfig', () => {
      const config = new UrlConfig('https://example.com/path?foo=bar#hash')
      const url = new MutableUrl(config)
      expect(url.origin).toBe('https://example.com')
      expect(url.path.toString()).toBe('path')
      expect(url.query.toString()).toBe('foo=bar')
      expect(url.hash).toBe('hash')
      expect(url.queryAppendMode).toBe(false)
    })

    test('setPath изменяет customPath', () => {
      const config = new UrlConfig('https://example.com')
      const url = new MutableUrl(config)
      url.setPath('newpath')
      expect((url as any)._customPath).toBe('newpath')
      expect(url.toString()).toBe('https://example.com/newpath')
    })

    test('setQuery устанавливает параметры через set', () => {
      const config = new UrlConfig('https://example.com')
      const url = new MutableUrl(config)
      url.setQuery([['foo', 'bar'], ['baz', 42]])
      expect(url.query.toString()).toBe('foo=bar&baz=42')
    })

    test('appendQuery добавляет параметры через append', () => {
      const config = new UrlConfig('https://example.com?foo=bar')
      const url = new MutableUrl(config)
      url.appendQuery([['foo', 'baz'], ['qux', '42']])
      expect(url.query.toString()).toBe('foo=bar&foo=baz&qux=42')
    })

    test('addQuery использует set при queryAppendMode=false', () => {
      const config = new UrlConfig('https://example.com?foo=bar', { queryExtendsMode: 0, queryAppendMode: 0, hashExtendsMode: 0 })
      const url = new MutableUrl(config)
      url.addQuery([['foo', 'baz'], ['qux', '42']])
      expect(url.query.toString()).toBe('foo=baz&qux=42')
    })

    test('addQuery использует append при queryAppendMode=true', () => {
      const config = new UrlConfig('https://example.com?foo=bar', { queryExtendsMode: 0, queryAppendMode: 1, hashExtendsMode: 0 })
      const url = new MutableUrl(config)
      url.addQuery([['foo', 'baz'], ['qux', '42']])
      expect(url.query.toString()).toBe('foo=bar&foo=baz&qux=42')
    })

    test('setHash изменяет хэш', () => {
      const config = new UrlConfig('https://example.com')
      const url = new MutableUrl(config)
      url.setHash('newhash')
      expect(url.hash).toBe('newhash')
      expect(url.toString()).toBe('https://example.com/#newhash')
      url.setHash(null)
      expect(url.hash).toBeNull()
      expect(url.toString()).toBe('https://example.com/')
    })

    test('toString формирует корректный URL', () => {
      const config = new UrlConfig('https://example.com/path?foo=bar#hash')
      const url = new MutableUrl(config)
      url.setPath('custom')
      url.setQuery([['baz', 'qux']])
      url.setHash('newhash')
      expect(url.toString()).toBe('https://example.com/path/custom?foo=bar&baz=qux#newhash')
    })

    test('toString обрабатывает пустой путь и customPath', () => {
      const config = new UrlConfig('https://example.com')
      const url = new MutableUrl(config)
      url.setPath('custom')
      expect(url.toString()).toBe('https://example.com/custom')
    })
  })
})
