import type { UOptional } from '../types.js'
import { hasOwn, isNullish, isPlainObject } from '../utils.js'
import type { THttpRequestMethod } from './types.js'
import type { MutableHeaders } from './HeadersConfig.js'

// NOTE Не знаю что это https://developer.mozilla.org/en-US/docs/Web/API/Request/destination
// destination?: Nullish | RequestDestination
/**
 * Базовые имена свойств {@link RequestInit}.
 */
const requestInitBaseConfigProps = Object.freeze([
  'cache', // RequestCache
  'credentials', // RequestCredentials
  'integrity', // string
  'keepalive', // boolean
  'method', // NOTE только свои методы THttpRequestMethod
  'mode', // RequestMode
  'priority', // RequestPriority
  'redirect', // RequestRedirect
  'referrer', // string
  'referrerPolicy' // ReferrerPolicy
  // Эти параметры изменяются и не включены в список
  //  body: BodyInit | null
  //  headers: HeadersInit
  //  signal: AbortSignal | null
] as const)

/**
 * Базовые имена свойств {@link RequestInit}.
 */
type TRequestInitBaseCongigKey = (typeof requestInitBaseConfigProps)[number]

/**
 * Опциональные базовые параметры запроса [developer.mozilla.org#RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit),
 * за исключением `body` и `signal`.
 *
 * Фиксированные методы запросы {@link RequestInit.method} ограничат использование указаным методом и не могут быть
 * изменены. Не устанавливайте `method`, если он может изменяться в зависимости от вызываемых функций `get()/post()`.
 */
type TRequestInitOptions = UOptional<Pick<RequestInit, TRequestInitBaseCongigKey | 'headers'>>

/**
 * Опциональные базовые параметры запроса [developer.mozilla.org#RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit),
 * за исключением `headers`, `body` и `signal`.
 */
type TRequestInitBaseOptions = UOptional<Pick<RequestInit, TRequestInitBaseCongigKey>>

/**
 * Неизменяемы объект базовых параметров запроса {@link RequestInit}, исключая `body`, `headers` и `signal`.
 */
type TReadonlyRequestInitBaseConfig = { readonly [K in TRequestInitBaseCongigKey]?: RequestInit[K] }

/**
 * Режим слияния {@link TRequestInitBaseOptions}:
 *
 *  + `0` - Параметры не наследуются и полностью переопределяются новыми. По умолчанию.
 *  + `1` - Параметры наследуются.
 */
type TRequestInitExtendsMode = 0 | 1

/**
 * Приводит пользовательский объект {@link TRequestInitBaseOptions} к массиву пар `[prop, value][]` допустимых свойств.
 * Значения  `undefined | null` исключаются. Тип свойства должен быть допустимым значением и не проверяется.
 */
function requestInitBaseOptionsToEntries (custom: undefined | null | TRequestInitBaseOptions | RequestInitConfig): [TRequestInitBaseCongigKey, RequestInit[TRequestInitBaseCongigKey]][] {
  const result: [TRequestInitBaseCongigKey, RequestInit[TRequestInitBaseCongigKey]][] = []
  if (!custom) {
    return result
  }
  if (custom instanceof RequestInitConfig) {
    custom = custom.requestInitBase
  }
  for (const key of requestInitBaseConfigProps) {
    const value = custom[key]
    if (!isNullish(value)) {
      result.push([key, value])
    }
  }
  return result
}

/**
 * Нормализует опциональные пользовательские параметры и замораживает объект.
 * Если параметры пользователя в точночти совпадают, то результатом будет `base`.
 *
 * @param base   Базовый объект параметров.
 * @param custom Пользовательский объект.
 */
function requestInitBaseExtendsModeNew (
  base: TReadonlyRequestInitBaseConfig,
  custom: undefined | null | TRequestInitBaseOptions | RequestInitConfig
): TReadonlyRequestInitBaseConfig {
  const keys = new Set(Object.keys(base))
  const entries = requestInitBaseOptionsToEntries(custom)
  if (keys.size !== entries.length) {
    return Object.freeze(Object.fromEntries(entries))
  }
  for (const [key, value] of entries) {
    if (!keys.delete(key) || base[key] !== value) {
      return Object.freeze(Object.fromEntries(entries))
    }
  }
  // На всякий случай(выше мы должны выйти), и тесты сюда не должны пробраться.
  if (keys.size > 0) {
    return Object.freeze(Object.fromEntries(entries))
  }
  return base
}

/**
 * Нормализует опциональные пользовательские параметры и сливает с `base`.
 * Если параметры пользователя в точночти совпадают, то результатом будет `base`.
 *
 * @param base   Базовый объект параметров.
 * @param custom Пользовательский объект.
 */
function requestInitBaseExtendsModeReplace (
  base: TReadonlyRequestInitBaseConfig,
  custom: undefined | null | TRequestInitBaseOptions | RequestInitConfig
): TReadonlyRequestInitBaseConfig {
  const keys = new Set(Object.keys(base)) as Set<TRequestInitBaseCongigKey>
  const entries = requestInitBaseOptionsToEntries(custom)
  if (entries.length === 0) {
    return base
  }
  let isEquals = true
  for (const [key, value] of entries) {
    if (!keys.delete(key) || base[key] !== value) {
      isEquals = false
    }
  }
  if (keys.size > 0) {
    isEquals = false
    for (const key of keys) {
      entries.push([key, base[key]])
    }
  }
  return isEquals ? base : Object.freeze(Object.fromEntries(entries))
}

const _EXTENDS_MARKER = Symbol()

/**
 * Базовые неизменяемы параметры запроса {@link RequestInit}, исключая `method`, `body`, `headers` и `signal`.
 */
class RequestInitConfig {
  protected _requestInitBase: TReadonlyRequestInitBaseConfig
  protected _extendsMode: TRequestInitExtendsMode

  /**
   * @param readonlyRequestInit Базовые параметры.
   * @param extendsMode Режим расширения базовых параметров.
   */
  constructor(readonlyRequestInit: undefined | null | TRequestInitBaseOptions, extendsMode: TRequestInitExtendsMode) {
    if (readonlyRequestInit === _EXTENDS_MARKER as any) {
      this._requestInitBase = (extendsMode as unknown as [TReadonlyRequestInitBaseConfig])[0]
      this._extendsMode = (extendsMode as unknown as [any, TRequestInitExtendsMode])[1]
    }
    else {
      this._requestInitBase = Object.freeze(
        Object.fromEntries(isPlainObject(readonlyRequestInit)
          ? requestInitBaseOptionsToEntries(readonlyRequestInit)
          : [])
      )
      this._extendsMode = extendsMode === 1 ? 1 : 0
    }
  }

  get extendsMode (): TRequestInitExtendsMode {
    return this._extendsMode
  }

  get requestInitBase (): TReadonlyRequestInitBaseConfig {
    return this._requestInitBase
  }

  has (key: TRequestInitBaseCongigKey): boolean {
    return hasOwn(this._requestInitBase, key)
  }

  /**
   * Возвращает значение параметра или `undefined`.
   *
   * @param key Допустимый ключ.
   */
  get<K extends TRequestInitBaseCongigKey> (key: K): undefined | RequestInit[K] {
    return this._requestInitBase[key]
  }

  /**
   * Расширяет текущий инстанс пользовательскими параметрами.
   *
   * Если параметры пользователя `custom` в точности совпадают, функция вернет ссылку на собственный `this`.
   *
   * @param custom Пользовательский объект параметров с перечислимыми допустимыми свойствами.
   */
  extends (custom: undefined | null | TRequestInitBaseOptions | RequestInitConfig): RequestInitConfig {

    if (custom instanceof RequestInitConfig) {
      custom = custom._requestInitBase
    }
    const requestInit = this._extendsMode === 1
      ? requestInitBaseExtendsModeReplace(this._requestInitBase, custom)
      : requestInitBaseExtendsModeNew(this._requestInitBase, custom)
    return this._requestInitBase === requestInit
      ? this
      : new RequestInitConfig(
        // @ts-expect-error
        _EXTENDS_MARKER, [requestInit, this._extendsMode]
      )
  }
}

/**
 * Обертка над параметрами запроса, которая непосредственно передается в {@link fetch()} или {@link Request}.
 *
 * Для использования с нативными классами и функциями следует привести инстанс класса к типу {@link RequestInit}.
 * Это необходимо из-за ограничений `TS`, где необязательное свойство `{cache?: ...}`, не то же что `{cache: undefined}`.
 *
 * ```ts
 * const mutInit = new MutableRequestInit(...)
 * await fetch('http://site.com', mutInit as RequestInit)
 * // или
 * await fetch('http://site.com', mutInit.toCompatibleType())
 * ```
 */
class MutableRequestInit {
  protected _refInit: TReadonlyRequestInitBaseConfig
  protected _body: null | BodyInit = null
  protected readonly _headers: MutableHeaders
  protected _method: THttpRequestMethod
  protected _signal: null | AbortSignal = null
  protected _copied = false

  constructor(
    readonlyConfig: TReadonlyRequestInitBaseConfig,
    method: THttpRequestMethod,
    headers: MutableHeaders
  ) {
    this._refInit = readonlyConfig
    this._method = method
    this._headers = headers
  }

  /**
   * Этот метод ничего не делает и возвращает `this` с приведением типа к {@link RequestInit}.
   */
  toCompatibleType (): RequestInit {
    return this as RequestInit
  }

  /**
   * Этот метод не разрешен для `middleware` и доступен внутреннему контексту управляющему задачами запросов.
   */
  _setAbortSignal (value: undefined | null | AbortSignal): void {
    this._signal = value ?? null
  }

  protected _ensureCopy (): void {
    if (!this._copied) {
      this._copied = true
      this._refInit = { ...this._refInit }
    }
  }

  protected _smartSetter (property: TRequestInitBaseCongigKey, value: any): void {
    const v = this._refInit[property]
    if (isNullish(value)) {
      if (v) {
        this._ensureCopy()
        // @ts-expect-error
        this._refInit[property] = undefined
      }
    }
    else if (!v || v !== value) {
      this._ensureCopy()
      // @ts-expect-error
      this._refInit[property] = value
    }
  }

  /**
   * Если не установлено возвратит тот же тип `null` что и нативный {@link RequestInit.body}.
   */
  get body (): null | BodyInit {
    return this._body
  }

  set body (value: undefined | null | BodyInit) {
    this._body = value ?? null
  }

  /**
   * Для `middleware` это свойство запрещено и не должно быть использовано.
   *
   * Изменение заголовков доступно через контекст выполнения запроса.
   * Доступ к свойству освобождается непосредственно перед запросом.
   */
  get headers (): undefined | HeadersInit {
    return this._headers.toHeadersInit()
  }

  /**
   * Для `middleware` это свойство запрещено и не должно быть использовано.
   *
   * Попытка установить заголовки этим `setter` будет проигнорирована. Нативные {@link fetch()} и {@link Request} не
   * используют `setter` и читают заголовки через `getter`.
   *
   * Изменение заголовков доступно через контекст выполнения запроса.
   */
  set headers (_value: undefined | null | HeadersInit) {
    console.warn("Несанкционированная попытка прямого изменения 'MutableRequestInit.headers'")
  }

  get method (): THttpRequestMethod {
    return this._method
  }

  /**
   * Для `middleware` это свойство запрещено и не должно быть использовано.
   *
   * Попытка установить `method` будет проигнорирована. Нативные {@link fetch()} и {@link Request} не
   * используют `setter` и читают заголовки через `getter`.
   */
  set method (_value: null | THttpRequestMethod) {
    console.warn("Несанкционированная попытка прямого изменения 'MutableRequestInit.method'")
  }

  /**
   * Если не установлено возвратит тот же тип `null` что и нативный {@link RequestInit.signal}.
   */
  get signal (): null | AbortSignal {
    return this._signal
  }

  /**
   * Для `middleware` это свойство запрещено и не должно быть использовано.
   *
   * Попытка установить `AbortSignal` будет проигнорирована. Нативные {@link fetch()} и {@link Request} не
   * используют `setter` и только читают через `getter`.
   *
   * `AbortSignal` устанавливается контекстом или внутренним методом {@link _setAbortSignal()}.
   */
  set signal (_value: undefined | null | AbortSignal) {
    console.warn("Несанкционированная попытка прямого изменения 'MutableRequestInit.signal'")
  }

  get cache (): undefined | RequestCache {
    return this._refInit.cache
  }

  set cache (value: undefined | null | RequestCache) {
    this._smartSetter('cache', value)
  }

  get credentials (): undefined | RequestCredentials {
    return this._refInit.credentials
  }

  set credentials (value: undefined | null | RequestCredentials) {
    this._smartSetter('credentials', value)
  }

  get integrity (): undefined | string {
    return this._refInit.integrity
  }

  set integrity (value: undefined | null | string) {
    this._smartSetter('integrity', value)
  }

  get keepalive (): undefined | boolean {
    return this._refInit.keepalive
  }

  set keepalive (value: undefined | null | boolean) {
    this._smartSetter('keepalive', value)
  }

  get mode (): undefined | RequestMode {
    return this._refInit.mode
  }

  set mode (value: undefined | null | RequestMode) {
    this._smartSetter('mode', value)
  }

  get priority (): undefined | RequestPriority {
    return this._refInit.priority
  }

  set priority (value: undefined | null | RequestPriority) {
    this._smartSetter('priority', value)
  }

  get redirect (): undefined | RequestRedirect {
    return this._refInit.redirect
  }

  set redirect (value: undefined | null | RequestRedirect) {
    this._smartSetter('redirect', value)
  }

  get referrer (): undefined | string {
    return this._refInit.referrer
  }

  set referrer (value: undefined | null | string) {
    this._smartSetter('referrer', value)
  }

  get referrerPolicy (): undefined | ReferrerPolicy {
    return this._refInit.referrerPolicy
  }

  set referrerPolicy (value: undefined | null | ReferrerPolicy) {
    this._smartSetter('referrerPolicy', value)
  }
}

export {
  requestInitBaseConfigProps,
  type TRequestInitBaseCongigKey,
  type TRequestInitOptions,
  type TRequestInitBaseOptions,
  type TReadonlyRequestInitBaseConfig,
  type TRequestInitExtendsMode,
  requestInitBaseOptionsToEntries,
  requestInitBaseExtendsModeNew,
  requestInitBaseExtendsModeReplace,
  RequestInitConfig,
  MutableRequestInit
}
