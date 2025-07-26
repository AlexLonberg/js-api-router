import { describe, test, expect } from 'vitest'
import {
  // type THeadersExtendsMode,
  // type THeadersAppendMode,
  // type THeadersReadonlyEntries,
  type THeadersMap,
  // type THeadersReadonlyMap,
  headersInitToEntries,
  headersInitToMap,
  headersMapDeepFreeze,
  headersExtendsModeNew,
  headersExtendsModeReplace,
  headersExtendsModeAppend,
  HeadersConfig,
  MutableHeaders
} from './HeadersConfig.js'
import { freezeMap } from '../utils.js'

describe('headersInitToEntries', () => {
  test('handles Headers input with lowercase keys', () => {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    expect(headersInitToEntries(headers)).toStrictEqual([['content-type', 'application/json']])
  })

  test('handles array input', () => {
    const input: HeadersInit = [['Content-Type', 'application/json'], ['X-Foo', 'bar']]
    expect(headersInitToEntries(input)).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
  })

  test('handles object input', () => {
    const input = { 'Content-Type': 'application/json', 'X-Foo': 'bar' }
    expect(headersInitToEntries(input)).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
  })

  test('filters invalid array items', () => {
    const input = [['Content-Type', 'application/json'], ['X-Foo'], [123, 'bar']] as any
    expect(headersInitToEntries(input)).toStrictEqual([['Content-Type', 'application/json']])
  })

  test('filters non-string object values', () => {
    const input = { 'Content-Type': 'application/json', 'X-Foo': 42 }
    // @ts-expect-error
    expect(headersInitToEntries(input)).toStrictEqual([['Content-Type', 'application/json']])
  })

  test('handles null/undefined', () => {
    expect(headersInitToEntries(null)).toBeNull()
    expect(headersInitToEntries(undefined)).toBeNull()
  })
})

describe('headersInitToMap', () => {
  test('converts headers to map with lowercase keys', () => {
    const input: HeadersInit = [['Content-Type', 'application/json'], ['CONTENT-TYPE', 'text/plain']]
    const map = headersInitToMap(input)
    expect(map).toBeInstanceOf(Map)
    expect([...map!.keys()]).toContain('content-type')
    expect(map!.get('content-type')).toStrictEqual([['Content-Type', 'application/json'], ['CONTENT-TYPE', 'text/plain']])
  })

  test('handles empty input', () => {
    expect(headersInitToMap(null)).toBeNull()
    expect(headersInitToMap([])).toBeNull()
    expect(headersInitToMap({})).toBeNull()
  })
})

describe('headersMapDeepFreeze', () => {
  test('freezes header pairs arrays', () => {
    const map: THeadersMap = new Map([['content-type', [['Content-Type', 'application/json']]]])
    const frozen = headersMapDeepFreeze(map)
    expect(Object.isFrozen(frozen.get('content-type'))).toBe(true)
    expect(Object.isFrozen(frozen.get('content-type')![0])).toBe(true)
  })
})

describe('headersExtendsModeNew', () => {
  test('replaces all headers (mode 0)', () => {
    const base: THeadersMap = new Map([['x', [['x', '1']]]])
    const custom: HeadersInit = [['y', '2']]
    const result = headersExtendsModeNew(freezeMap(base), custom)
    expect([...result.keys()]).toContain('y')
    expect(result.get('y')).toStrictEqual([['y', '2']])
    expect(result.has('x')).toBe(false)
  })

  test('returns same instance if equal', () => {
    const base: THeadersMap = new Map([['x', [['x', '1']]]])
    const custom: HeadersInit = [['x', '1']]
    const result = headersExtendsModeNew(freezeMap(base), custom)
    expect(result).toBe(base)
  })
})

describe('headersExtendsModeReplace', () => {
  test('replaces matching keys and keeps others (mode 1)', () => {
    const base: THeadersMap = new Map([['x', [['x', '1'], ['x', '2']]], ['y', [['y', '3']]]])
    const custom: HeadersInit = [['x', '4'], ['x', '5'], ['z', '6']]
    const result = headersExtendsModeReplace(freezeMap(base), custom)
    expect(new Set(result.keys())).toStrictEqual(new Set(['x', 'y', 'z']))
    expect(result.get('x')).toStrictEqual([['x', '4'], ['x', '5']])
    expect(result.get('y')).toStrictEqual([['y', '3']])
    expect(result.get('z')).toStrictEqual([['z', '6']])
  })

  test('returns same instance if equal', () => {
    const base: THeadersMap = new Map([['x', [['x', '1']]]])
    const custom: HeadersInit = [['x', '1']]
    const result = headersExtendsModeReplace(freezeMap(base), custom)
    expect(result).toBe(base)
  })
})

describe('headersExtendsModeAppend', () => {
  test('appends headers (mode 2)', () => {
    const base: THeadersMap = new Map([['x', [['x', '1']]]])
    const custom: HeadersInit = [['x', '2']]
    const result = headersExtendsModeAppend(freezeMap(base), custom)
    expect(new Set(result.keys())).toStrictEqual(new Set(['x']))
    expect(result.get('x')).toStrictEqual([['x', '1'], ['x', '2']])
  })

  test('returns same instance if no custom headers', () => {
    const base: THeadersMap = new Map([['x', [['x', '1']]]])
    const result = headersExtendsModeAppend(freezeMap(base), null)
    expect(result).toBe(base)
  })
})

describe('HeadersConfig class', () => {
  test('initializes correctly with different inputs', () => {
    const headers1 = new HeadersConfig({ 'Content-Type': 'application/json' }, 1, 0)
    expect(new Set(headers1.map.keys())).toStrictEqual(new Set(['content-type']))
    expect(headers1.entries).toStrictEqual([['Content-Type', 'application/json']])
    expect(headers1.extendsMode).toBe(1)
    expect(headers1.appendMode).toBe(0)
    expect(headers1.isEmpty()).toBe(false)

    const headers2 = new HeadersConfig(null, 0, 0)
    expect(headers2.isEmpty()).toBe(true)
  })

  describe('extends with extendsMode 0 (no inheritance)', () => {
    test('replaces with new headers', () => {
      const headers1 = new HeadersConfig({ 'x': '1' }, 0, 0)
      const headers2 = headers1.extends({ 'y': '2' })
      expect(new Set(headers2.map.keys())).toStrictEqual(new Set(['y']))
      expect(headers2.entries).toStrictEqual([['y', '2']])
    })

    test('returns same instance for empty extends', () => {
      const headers1 = new HeadersConfig(null, 0, 0)
      const headers2 = headers1.extends(null)
      expect(headers2).toBe(headers1)
    })
  })

  describe('extends with extendsMode 1 (replace matching keys)', () => {
    test('replaces matching keys and keeps others', () => {
      const headers1 = new HeadersConfig({ 'x': '1', 'y': '3' }, 1, 0)
      const headers2 = headers1.extends([['x', '4'], ['x', '5'], ['z', '6']])
      expect(new Set(headers2.map.keys())).toStrictEqual(new Set(['x', 'y', 'z']))
      expect(headers2.map.get('x')).toStrictEqual([['x', '4'], ['x', '5']])
      expect(headers2.map.get('y')).toStrictEqual([['y', '3']])
      expect(headers2.map.get('z')).toStrictEqual([['z', '6']])
    })
  })

  describe('extends with extendsMode 2 (append all keys)', () => {
    test('appends all headers including duplicates', () => {
      const headers1 = new HeadersConfig({ 'x': '1', 'y': '2' }, 2, 0)
      const headers2 = headers1.extends({ 'x': '3', 'z': '4' })
      expect(new Set(headers2.map.keys())).toStrictEqual(new Set(['x', 'y', 'z']))
      expect(headers2.map.get('x')).toStrictEqual([['x', '1'], ['x', '3']])
      expect(headers2.map.get('y')).toStrictEqual([['y', '2']])
      expect(headers2.map.get('z')).toStrictEqual([['z', '4']])
    })
  })

  test('extends with HeadersConfig instance', () => {
    const headers1 = new HeadersConfig({ 'x': '1' }, 1, 0)
    const headers2 = new HeadersConfig({ 'y': '2' }, 1, 0)
    const result = headers1.extends(headers2)
    expect(new Set(result.map.keys())).toStrictEqual(new Set(['x', 'y']))
  })

  test('maintains immutability of header pairs', () => {
    const headers = new HeadersConfig({ 'x': '1' }, 1, 0)
    expect(Object.isFrozen(headers.entries)).toBe(true)
    expect(Object.isFrozen(headers.entries[0])).toBe(true)
    expect(Object.isFrozen(headers.map.get('x'))).toBe(true)
    expect(Object.isFrozen(headers.map.get('x')![0])).toBe(true)
  })
})


// @ts-expect-error
interface TestMutableHeaders extends MutableHeaders {
  readonly _map: Map< /*lower*/ string, [string, string][]>
  readonly _entries: null | [string, string][]
  readonly _copied: boolean
}
const createHeaders = (init?: [string, string][]): TestMutableHeaders => {
  return new MutableHeaders(new HeadersConfig(init, 1, 0)) as unknown as TestMutableHeaders
}

describe('MutableHeaders', () => {
  describe('constructor', () => {
    test('инициализирует с корректными данными', () => {
      const init: HeadersInit = [['Content-Type', 'application/json'], ['X-Foo', 'bar']]
      const headers = createHeaders(init)
      expect(new Set(headers.keys())).toStrictEqual(new Set(['content-type', 'x-foo']))
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
    })

    test('инициализирует с пустыми данными', () => {
      const headers = createHeaders()
      expect(new Set(headers.keys())).toStrictEqual(new Set([]))
      expect(headers.toHeadersInit()).toStrictEqual([])
    })
  })

  describe('has', () => {
    test('проверяет наличие заголовка с учетом регистра', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      expect(headers.has('Content-Type')).toBe(true)
      expect(headers.has('content-type')).toBe(true)
      expect(headers.has('X-Foo')).toBe(false)
    })
  })

  describe('get', () => {
    test('возвращает значения заголовков через запятую', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      headers.append('Content-Type', 'text/plain')
      expect(headers.get('Content-Type')).toBe('application/json, text/plain')
      expect(headers.get('content-type')).toBe('application/json, text/plain')
      expect(headers.get('X-Foo')).toBeNull()
    })
  })

  describe('append', () => {
    test('добавляет новый заголовок', () => {
      const headers = createHeaders()
      headers.append('Content-Type', 'application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(new Set(headers.keys())).toStrictEqual(new Set(['content-type']))
    })

    test('добавляет значение к существующему заголовку', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      headers.append('Content-Type', 'text/plain')
      expect(headers.get('Content-Type')).toBe('application/json, text/plain')
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json'], ['Content-Type', 'text/plain']])
    })

    test('не добавляет дублирующее значение в конец', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      headers.append('Content-Type', 'application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json']])
    })
  })

  describe('set', () => {
    test('устанавливает новый заголовок', () => {
      const headers = createHeaders()
      headers.set('Content-Type', 'application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(new Set(headers.keys())).toStrictEqual(new Set(['content-type']))
    })

    test('заменяет существующий заголовок', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['Content-Type', 'text/plain']])
      headers.set('Content-Type', 'application/xml')
      expect(headers.get('Content-Type')).toBe('application/xml')
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/xml']])
    })

    test('не изменяет, если значение и имя совпадают', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      const originalMap = headers._map
      headers.set('Content-Type', 'application/json')
      expect(headers._map).toBe(originalMap) // Проверяем, что копия не создавалась
    })
  })

  describe('delete', () => {
    test('удаляет существующий заголовок', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      headers.delete('Content-Type')
      expect(headers.has('Content-Type')).toBe(false)
      expect(headers.toHeadersInit()).toStrictEqual([])
    })

    test('не изменяет, если заголовок отсутствует', () => {
      const headers = createHeaders()
      const originalMap = headers._map
      headers.delete('Content-Type')
      expect(headers._map).toBe(originalMap)
    })
  })

  describe('entries', () => {
    test('возвращает итератор пар ключ-значение', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['Content-Type', 'text/plain']])
      expect([...headers.entries()]).toStrictEqual([['content-type', 'application/json, text/plain']])
    })
  })

  describe('keys', () => {
    test('возвращает итератор ключей в нижнем регистре', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
      expect(new Set(headers.keys())).toStrictEqual(new Set(['content-type', 'x-foo']))
    })
  })

  describe('values', () => {
    test('возвращает итератор значений', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['Content-Type', 'text/plain']])
      expect([...headers.values()]).toStrictEqual(['application/json, text/plain'])
    })
  })

  describe('forEach', () => {
    test('вызывает callback для каждого заголовка', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
      const result: [string, string][] = []
      headers.forEach((value, key) => result.push([key, value]))
      expect(new Set(result.map(([key]) => key))).toStrictEqual(new Set(['content-type', 'x-foo']))
      expect(result.map(([, value]) => value)).toContain('application/json')
      expect(result.map(([, value]) => value)).toContain('bar')
    })
  })

  describe('getSetCookie', () => {
    test('возвращает массив значений для set-cookie', () => {
      const headers = createHeaders([['Set-Cookie', 'cookie1=value1'], ['Set-Cookie', 'cookie2=value2']])
      expect(headers.getSetCookie()).toStrictEqual(['cookie1=value1', 'cookie2=value2'])
    })

    test('возвращает пустой массив, если set-cookie отсутствует', () => {
      const headers = createHeaders()
      expect(headers.getSetCookie()).toStrictEqual([])
    })
  })

  describe('toHeadersInit', () => {
    test('возвращает массив пар заголовков', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
    })

    test('кэширует результат при неизмененной структуре', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      const first = headers.toHeadersInit()
      expect(headers.toHeadersInit()).toBe(first)
    })

    test('сбрасывает кэш после изменения', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      const first = headers.toHeadersInit()
      headers.append('X-Foo', 'bar')
      expect(headers.toHeadersInit()).not.toBe(first)
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
    })
  })

  describe('copyEntries', () => {
    test('возвращает копию массива пар', () => {
      const headers = createHeaders([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
      const copy = headers.copyEntries()
      expect(copy).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
      copy.push(['X-Bar', 'baz'])
      expect(headers.toHeadersInit()).toStrictEqual([['Content-Type', 'application/json'], ['X-Foo', 'bar']])
    })
  })

  describe('ensureCopy', () => {
    test('создает копию данных при первом изменении', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      const originalMap = headers._map
      headers.append('Content-Type', 'text/plain')
      expect(headers._map).not.toBe(originalMap)
      expect(headers._copied).toBe(true)
      expect(headers._entries).toBeNull()
    })

    test('не создает лишних копий', () => {
      const headers = createHeaders([['Content-Type', 'application/json']])
      headers.append('Content-Type', 'text/plain')
      const copiedMap = headers._map
      headers.append('X-Foo', 'bar')
      expect(headers._map).toBe(copiedMap)
    })
  })
})
