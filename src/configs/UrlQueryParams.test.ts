import { describe, test, expect } from 'vitest'
import {
  type TUrlQueryOptions,
  // type TUrlQueryExtendsMode,
  // type TUrlQueryAppendMode,
  normalizeArrayQueryParams,
  normalizeObjectQueryParams,
  normalizeUrlQueryParams,
  UrlQueryParams
} from './UrlQueryParams.js'

describe('normalizeArrayQueryParams', () => {
  test('normalizes array of pairs correctly', () => {
    const input: TUrlQueryOptions = [['key1', 'value1'], ['key2', 42], ['key3', true], ['key4', null]]
    expect(normalizeArrayQueryParams(input)).toStrictEqual([
      ['key1', 'value1'],
      ['key2', '42'],
      ['key3', 'true'],
      ['key4', '']
    ])
  })

  test('filters invalid array items', () => {
    const input = [['key1', 'value1'], ['key2'], [123, 'value2']] as any
    expect(normalizeArrayQueryParams(input)).toStrictEqual([['key1', 'value1']])
  })
})

describe('normalizeObjectQueryParams', () => {
  test('normalizes object correctly', () => {
    const input = { key1: 'value1', key2: 42, key3: true, key4: null }
    expect(normalizeObjectQueryParams(input)).toStrictEqual([
      ['key1', 'value1'],
      ['key2', '42'],
      ['key3', 'true'],
      ['key4', '']
    ])
  })
})

describe('normalizeUrlQueryParams', () => {
  test('handles null/undefined', () => {
    expect(normalizeUrlQueryParams(null)).toBeNull()
    expect(normalizeUrlQueryParams(undefined)).toBeNull()
  })

  test('handles string input', () => {
    const result = normalizeUrlQueryParams('foo=bar&baz=42')
    expect(result).toBeInstanceOf(URLSearchParams)
    expect(result?.toString()).toBe('foo=bar&baz=42')
  })

  test('handles array input', () => {
    const input = [['foo', 'bar'], ['baz', 42]] as const
    const result = normalizeUrlQueryParams(input)
    expect(result?.toString()).toBe('foo=bar&baz=42')
  })

  test('handles object input', () => {
    const input = { foo: 'bar', baz: 42 }
    const result = normalizeUrlQueryParams(input)
    expect(result?.toString()).toBe('foo=bar&baz=42')
  })

  test('handles URLSearchParams input', () => {
    const input = new URLSearchParams('foo=bar')
    const result = normalizeUrlQueryParams(input)
    expect(result?.toString()).toBe('foo=bar')
  })
})

describe('UrlQueryParams class', () => {
  test('initializes correctly with different inputs', () => {
    const param1 = new UrlQueryParams({ foo: 'bar' }, 1, 0)
    expect(param1.toString()).toBe('foo=bar')
    expect(param1.extendsMode).toBe(1)
    expect(param1.appendMode).toBe(0)
    expect(param1.isEmpty()).toBe(false)

    const param2 = new UrlQueryParams(null, 0, 0)
    expect(param2.toString()).toBe('')
    expect(param2.isEmpty()).toBe(true)
  })

  describe('extends with extendsMode 0 (no inheritance)', () => {
    test('replaces with new params', () => {
      const param1 = new UrlQueryParams({ foo: 'bar' }, 0, 0)
      const param2 = param1.extends({ baz: 'qux' })
      expect(param2.toString()).toBe('baz=qux')
    })

    test('returns same instance for empty extends', () => {
      const param1 = new UrlQueryParams(null, 0, 0)
      const param2 = param1.extends(null)
      expect(param2).toBe(param1)
    })
  })

  describe('extends with extendsMode 1 (merge missing keys)', () => {
    test('merges parameters keeping unique keys', () => {
      const param1 = new UrlQueryParams({ foo: 'bar', common: 'old' }, 1, 0)
      const param2 = param1.extends({ baz: 'qux', common: 'new' })
      expect(param2.toString()).toBe('foo=bar&baz=qux&common=new')
    })

    test('handles empty base params', () => {
      const param1 = new UrlQueryParams(null, 1, 0)
      const param2 = param1.extends({ foo: 'bar' })
      expect(param2.toString()).toBe('foo=bar')
    })
  })

  describe('extends with extendsMode 2 (append all keys)', () => {
    test('appends all parameters including duplicates', () => {
      const param1 = new UrlQueryParams({ foo: 'bar', common: 'old' }, 2, 0)
      const param2 = param1.extends({ baz: 'qux', common: 'new' })
      const params = param2.urlSearchParams()
      expect(params.getAll('common')).toStrictEqual(['old', 'new'])
      expect(params.get('foo')).toBe('bar')
      expect(params.get('baz')).toBe('qux')
    })
  })

  test('extends with UrlQueryParams instance', () => {
    const param1 = new UrlQueryParams({ foo: 'bar' }, 1, 0)
    const param2 = new UrlQueryParams({ baz: 'qux' }, 1, 0)
    const result = param1.extends(param2)
    expect(result.toString()).toBe('foo=bar&baz=qux')
  })

  test('urlSearchParams returns new instance', () => {
    const param1 = new UrlQueryParams({ foo: 'bar' }, 1, 0)
    const usp1 = param1.urlSearchParams()
    const usp2 = param1.urlSearchParams()
    expect(usp1).not.toBe(usp2)
    expect(usp1.toString()).toBe('foo=bar')
  })
})

test('native URLSearchParams', () => {
  const params = new URLSearchParams([['foo', '1'], ['bar', '2'], ['Foo', '3']])

  expect(params.size).toBe(3)

  expect(params.get('foo')).toBe('1')
  expect(params.get('Foo')).toBe('3')
  expect(params.getAll('foo')).toStrictEqual(['1'])

  params.delete('foo')
  expect(params.size).toBe(2)
})
