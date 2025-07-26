import { isObject, isArray, isString, freezeMap } from '../utils.js'

/**
 * Режим слияния заголовков при расширении конфигурации:
 *
 *  + `0` - (default) Заголовки не наследуются.
 * ```
 * {x:1} + {y:2} = {y:2}
 * ```
 *  + `1` - Заменяет все заголовки с одним именем, если найдено хотя бы одно совпадение.
 * ```
 * {x:1, x:2, y:3} + {x:4, x:5, z:6} = {y:3, x:4, x:5, z:6}
 * ```
 *  + `2` - Добавляет все заголовки методом {@link Headers.append()}.
 * ```
 * {x:1} + {x:1} = {x:1, x:1}
 * ```
 */
type THeadersExtendsMode = 0 | 1 | 2
/**
 * Режим автоматической подстановки заголовков непосредственно перед `fetch()`.
 *
 * + `0` - (default) Заголовки устанавливаются методом {@link Headers.set()}.
 * + `1` - Заголовки устанавливаются методом {@link Headers.append()}.
 */
type THeadersAppendMode = 0 | 1

/**
 * Неизменяемый массив пар `[headerKey, headerValue][]`.
 *
 * Этот тип передается в нативные функции запроса {@link fetch()} или {@link Request}.
 */
type THeadersReadonlyEntries = readonly (readonly [string, string])[]

type THeadersMap = Map< /* lower */ string, [string, string][]>
type THeadersReadonlyMap = ReadonlyMap< /* lower */ string, readonly (readonly [string, string])[]>

/**
 * Приводит {@link HeadersInit} к парам `[string, string][]`.
 *
 * @param headers Допустимый объект заголовков. Если аргумент недопустим или пуст, функция возвратит `null`.
 */
function headersInitToEntries (headers?: undefined | null | HeadersInit | HeadersConfig | MutableHeaders): null | [string, string][] {
  let entries: null | [string, string][] = null
  if (headers instanceof Headers) {
    entries = [...headers.entries()]
  }
  else if (headers instanceof HeadersConfig) {
    entries = headers.entries.map(([k, v]) => [k, v])
  }
  else if (headers instanceof MutableHeaders) {
    entries = headers.copyEntries() // [string, string][]
  }
  else if (isArray(headers)) {
    entries = []
    for (const pair of headers) {
      if (isArray(pair) && pair.length === 2 && isString(pair[0]) && isString(pair[1])) {
        entries.push(pair)
      }
    }
  }
  else if (isObject(headers)) {
    entries = []
    for (const pair of Object.entries(headers)) {
      if (isString(pair[1])) {
        entries.push(pair)
      }
    }
  }
  return (entries && entries.length > 0) ? entries : null
}

/**
 * Нормализует {@link HeadersInit} к карте с парами заголовков `[string, string][]`.
 *
 * Ключи `Map` приводятся в нижний регистр, сохраняя оригинальные имена заголовков в парах.
 *
 * @param headers Допустимый объект заголовков. Если аргумент недопустим или пуст, функция возвратит `null`.
 */
function headersInitToMap (headers?: undefined | null | HeadersInit | HeadersConfig | MutableHeaders): null | THeadersMap {
  const entries = headersInitToEntries(headers) // [string, string][] | null
  if (!entries) {
    return null
  }
  const map = new Map<string, [string, string][]>()
  for (const [name, value] of entries) {
    const key = name.toLowerCase()
    const values = map.get(key)
    if (values) {
      values.push([name, value])
    }
    else {
      map.set(key, [[name, value]])
    }
  }
  return map.size > 0 ? map : null
}

/**
 * Глубоко замораживает `Map` с парами заголовков.
 *
 * @param mutMap Заголовки полученные функцией {@link headersInitToMap}.
 */
function headersMapDeepFreeze (mutMap: THeadersMap): THeadersReadonlyMap {
  const map = new Map<string, readonly (readonly [string, string])[]>()
  for (const [key, pairs] of mutMap) {
    map.set(key, Object.freeze(pairs.map((pair) => Object.freeze(pair))))
  }
  return freezeMap(map)
}

function _headersPairsCopy (pairs: [string, string][] | readonly (readonly [string, string])[]): [string, string][] {
  return pairs.map(([k, v]) => [k, v])
}

function _headersPairsIsEquals (pairs1: [string, string][] | readonly (readonly [string, string])[], pairs2: [string, string][] | readonly (readonly [string, string])[]): boolean {
  return pairs1.length === pairs2.length && pairs1.every(([k, v], i) => k === pairs2[i]![0] && v === pairs2[i]![1])
}

/**
 * Нормализует и проверяет равенство пользовательских заголовков и `headers`.
 * Если заголовки полностью совпадают, возвратит ссылку на аргумент `headers`.
 *
 * @param headers Заголовки с которыми надо сравнить пользовательский `custom`.
 * @param custom  Пользовательские заголовки.
 */
function headersExtendsModeNew (headers: THeadersReadonlyMap, custom: undefined | null | HeadersInit | HeadersConfig | MutableHeaders): THeadersReadonlyMap | THeadersMap {
  const map = headersInitToMap(custom)
  if (!map) {
    return headers.size === 0 ? headers : new Map()
  }
  if (map.size !== headers.size) {
    return map
  }
  for (const [key, pairs] of headers) {
    const customPairs = map.get(key)
    if (!customPairs || !_headersPairsIsEquals(customPairs, pairs)) {
      return map
    }
  }
  return headers
}

/**
 * Сливает пользовательские заголовки заменяя все пары в `headers`, если найдено хотя бы одно совпадение ключа.
 * Если заголовки полностью совпадают, возвратит ссылку на аргумент `headers`.
 *
 * @param headers Заголовки с которыми надо слить пользовательский `custom`.
 * @param custom  Пользовательские заголовки.
 *
 * ```ts
 * // Псевдо-пример
 * const headers = headersExtendsModeReplace([[a, 1], [x, 2], [x, 3]], [[x, 4], [x, 5], [y, 6]])
 * // [[a, 1], [x, 4], [x, 5], [y, 6]]
 * ```
 */
function headersExtendsModeReplace (headers: THeadersReadonlyMap, custom: undefined | null | HeadersInit | HeadersConfig | MutableHeaders): THeadersReadonlyMap | THeadersMap {
  const map = headersInitToMap(custom)
  if (!map) {
    return headers
  }
  const newKeys = new Set(map.keys())
  let isEquals = true
  for (const [key, pairs] of headers) {
    newKeys.delete(key)
    const newPairs = map.get(key)
    if (!newPairs) {
      isEquals = false
      map.set(key, _headersPairsCopy(pairs))
    }
    else if (isEquals && !_headersPairsIsEquals(newPairs, pairs)) {
      isEquals = false
    }
  }
  if (newKeys.size > 0) {
    isEquals = false
  }
  return isEquals ? headers : map
}

/**
 * Сливает пользовательские заголовки с `headers` добавляя новые пары в конец.
 * Если пользовательских заголовков нет, возвратит ссылку на аргумент `headers`.
 *
 * @param headers Заголовки с которыми надо слить пользовательский `custom`.
 * @param custom  Пользовательские заголовки.
 */
function headersExtendsModeAppend (headers: THeadersReadonlyMap, custom: undefined | null | HeadersInit | HeadersConfig | MutableHeaders): THeadersReadonlyMap | THeadersMap {
  const map = headersInitToMap(custom)
  if (!map) {
    return headers
  }
  for (const [key, pairs] of headers) {
    const newPairs = map.get(key)
    const oldCopy = _headersPairsCopy(pairs)
    if (newPairs) {
      // Добавляем спереди
      newPairs.splice(0, 0, ...oldCopy)
    }
    else {
      map.set(key, oldCopy)
    }
  }
  return map
}

const _EXTENDS_MARKER = Symbol()

/**
 * Неизменяемый контейнер для {@link Headers}.
 */
class HeadersConfig {
  protected readonly _map: ReadonlyMap< /*lower*/ string, readonly (readonly [string, string])[]>
  protected readonly _entries: THeadersReadonlyEntries
  protected readonly _extendsMode: THeadersExtendsMode
  protected readonly _appendMode: THeadersAppendMode

  constructor(headers: undefined | null | HeadersInit | MutableHeaders | HeadersConfig, extendsMode: THeadersExtendsMode, appendMode: THeadersAppendMode) {
    if (headers === _EXTENDS_MARKER as any) {
      this._map = extendsMode as unknown as ReadonlyMap<string, readonly (readonly [string, string])[]>
      this._extendsMode = (appendMode as unknown as [THeadersExtendsMode])[0]
      this._appendMode = (appendMode as unknown as [any, THeadersAppendMode])[1]
    }
    else {
      if (headers instanceof HeadersConfig) {
        this._map = headers._map
      }
      else {
        const map = headersInitToMap(headers)
        this._map = map ? headersMapDeepFreeze(map) : freezeMap(new Map())
      }
      this._extendsMode = (extendsMode === 1 || extendsMode === 2) ? extendsMode : 0
      this._appendMode = appendMode === 1 ? 1 : 0
    }
    // Приводим к типу массива пар. Пары уже заморожены.
    const entries = []
    for (const items of this._map.values()) {
      entries.push(...items)
    }
    this._entries = Object.freeze(entries)
  }

  get extendsMode (): THeadersExtendsMode {
    return this._extendsMode
  }

  get appendMode (): THeadersAppendMode {
    return this._appendMode
  }

  isEmpty (): boolean {
    return this._map.size === 0
  }

  /**
   * Неизменяемая карта с замороженными парами заголовков.
   */
  get map (): ReadonlyMap< /*lower*/ string, readonly (readonly [string, string])[]> {
    return this._map
  }

  /**
   * Неизменяемый массив пар `readonly (readonly [string, string])[]`.
   *
   * Этот тип передается в нативные функции запроса {@link fetch()} или {@link Request}.
   */
  get entries (): THeadersReadonlyEntries {
    return this._entries
  }

  /**
   * Расширяет текущий инстанс или возвращает `this`, если заголовки не изменились.
   *
   * @param headers Заголовки для слияния.
   */
  extends (headers: undefined | null | HeadersInit | MutableHeaders | HeadersConfig): HeadersConfig {
    const map = this._extendsMode === 1
      ? headersExtendsModeReplace(this._map, headers)
      : this._extendsMode === 2
        ? headersExtendsModeAppend(this._map, headers)
        : headersExtendsModeNew(this._map, headers)
    return (map === this._map)
      ? this
      : new HeadersConfig(
        // @ts-expect-error
        _EXTENDS_MARKER,
        headersMapDeepFreeze(map as THeadersMap),
        [this._extendsMode, this._appendMode]
      )
  }

  toMutable (): MutableHeaders {
    return new MutableHeaders({ map: this._map, entries: this._entries })
  }
}

/**
 * Изменяемый объект заголовков с совместимыми методами {@link Headers}.
 */
class MutableHeaders implements Headers {
  protected _map: Map< /*lower*/ string, [string, string][]>
  protected _entries: null | [string, string][]
  protected _copied = false

  constructor(headers: { map: ReadonlyMap<string, readonly (readonly [string, string])[]>, entries: null | (readonly (readonly [string, string])[]) }) {
    this._map = headers.map as Map<string, [string, string][]>
    this._entries = headers.entries as (null | [string, string][])
  }

  protected _ensureCopy (): void {
    if (!this._copied) {
      this._copied = true
      this._entries = null
      const map = this._map
      this._map = new Map()
      for (const [key, items] of map) {
        this._map.set(key, items.map(([k, v]) => [k, v]))
      }
    }
  }

  has (name: string): boolean {
    const key = name.toLowerCase()
    return this._map.has(key)
  }

  get (name: string): null | string {
    const key = name.toLowerCase()
    const pairs = this._map.get(key)
    return pairs ? pairs.map((pair) => pair[1]).join(', ') : null
  }

  protected _appendToLast (key: string, name: string, value: string): void {
    this._ensureCopy()
    const pairs = this._map.get(key)
    if (!pairs) {
      return
    }
    for (let i = pairs.length - 1; i >= 0; --i) {
      // Не проверяем ключи
      if (pairs[i]![1] === value) {
        pairs.splice(i, 1)
      }
    }
    pairs.push([name, value])
  }

  /**
   * Аналог метода {@link Headers.append()}.
   */
  append (name: string, value: string): this {
    const key = name.toLowerCase()
    const pairs = this._map.get(key)
    // Оно будет всегда length > 0, но лучше проверить, чтоб не получить throw
    if (pairs && pairs.length > 0) {
      // Изменяем заголовки, только если не сходится порядок
      const last = pairs[pairs.length - 1]!
      if (last[1] !== value) {
        this._appendToLast(key, name, value)
      }
    }
    else {
      this._ensureCopy()
      this._map.set(key, [[name, value]])
    }
    return this
  }

  /**
   * Аналог метода {@link Headers.set()}.
   */
  set (name: string, value: string): this {
    const key = name.toLowerCase()
    const pairs = this._map.get(key)
    // В конце перепроверим имя, чтобы сохранить регистр
    if (!pairs || pairs.length !== 1 || pairs[0]![0] !== name || pairs[0]![1] !== value) {
      this._ensureCopy()
      this._map.set(key, [[name, value]])
    }
    return this
  }

  /**
   * Аналог метода {@link Headers.delete()}.
   */
  delete (name: string): this {
    const key = name.toLowerCase()
    if (this._map.has(key)) {
      this._ensureCopy()
      this._map.delete(key)
    }
    return this
  }

  *entries (): HeadersIterator<[string, string]> {
    for (const [key, pairs] of this._map) {
      const value = pairs.map((pair) => pair[1]).join(', ')
      yield [key, value]
    }
  }

  keys (): HeadersIterator<string> {
    return this._map.keys()
  }

  *values (): HeadersIterator<string> {
    for (const [_, pairs] of this._map) {
      const value = pairs.map((pair) => pair[1]).join(', ')
      yield value
    }
  }

  forEach (callbackfn: (value: string, key: string, parent: Headers) => void, _thisArg?: any): void {
    for (const [key, pairs] of this._map) {
      const value = pairs.map((pair) => pair[1]).join(', ')
      callbackfn(value, key, this)
    }
  }

  getSetCookie (): string[] {
    const pairs = this._map.get('set-cookie')
    return pairs ? pairs.map((pair) => pair[1]) : []
  }

  [Symbol.iterator] (): HeadersIterator<[string, string]> {
    return this.entries()
  }

  protected _toEntries (): HeadersInit {
    const entries = []
    for (const items of this._map.values()) {
      entries.push(...items)
    }
    return entries
  }

  /**
   * Возвращает неизменяемый массив пар `readonly (readonly[string, string])[]`.
   *
   * Фактически массив может быть изменяемым или замороженным и не должен использоваться для попыток изменений.
   * Возвращаемый тип {@link HeadersInit} определен для удобства передачи массива в нативные функции {@link fetch()}.
   */
  toHeadersInit (): HeadersInit {
    return this._entries ?? this._toEntries()
  }

  /**
   * Изменяемая копия пар.
   */
  copyEntries (): [string, string][] {
    const entries = []
    for (const items of this._map.values()) {
      entries.push(...items.map(([k, v]) => [k, v] as [string, string]))
    }
    return entries
  }
}

export {
  type THeadersExtendsMode,
  type THeadersAppendMode,
  type THeadersReadonlyEntries,
  type THeadersMap,
  type THeadersReadonlyMap,
  headersInitToEntries,
  headersInitToMap,
  headersMapDeepFreeze,
  headersExtendsModeNew,
  headersExtendsModeReplace,
  headersExtendsModeAppend,
  HeadersConfig,
  MutableHeaders
}
