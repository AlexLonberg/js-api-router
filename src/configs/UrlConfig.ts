import type { UOptional } from '../types.js'
import { errorDetails, ConfigureError } from '../errors.js'
import { isArray, isNonemptyString, isObject, isString, safeToJson } from '../utils.js'
import { type MutablePathComponents, PathComponents } from './PathComponents.js'
import { type TUrlQueryAppendMode, type TUrlQueryExtendsMode, type TUrlQueryOptions, UrlQueryParams } from './UrlQueryParams.js'

const _http = /^http:/i
const _endSlash = /\/+$/
const _urlHash = /^#+/
const _startProtocol = /^[a-z]+:\/\//i
const _wsProtocol = /^wss?:\/\//i
const re = Object.freeze({
  get http () {
    _http.lastIndex = 0
    return _http
  },
  get endSlash () {
    _endSlash.lastIndex = 0
    return _endSlash
  },
  get urlHash () {
    _urlHash.lastIndex = 0
    return _urlHash
  },
  get startProtocol () {
    _startProtocol.lastIndex = 0
    return _startProtocol
  },
  get wsProtocol () {
    _wsProtocol.lastIndex = 0
    return _wsProtocol
  }
} as const)

/**
 * Режим наследования хеша строки `url` при расширении конфигураций.
 *
 *   + `0` - `#hash` не наследуется. По умолчанию.
 *   + `1` - Наследуется, если не явно не задан.
 */
type TUrlHashExtendsMode = 0 | 1

/**
 * Режимы расширения параметров `URL` `?foo=bar` и `#hash`.
 */
type TUrlExtendsOptions = {
  /**
   * Режим слияния параметров строки `url` при расширении конфигураций.
   *
   *   + `0` - Строка `?foo=bar` не наследуется. По умолчанию.
   *   + `1` - Устанавливает режим слияния функцией {@link URLSearchParams.set()}
   *   + `2` - Устанавливает режим слияния функцией {@link URLSearchParams.append()}
   */
  readonly queryExtendsMode: TUrlQueryExtendsMode
  /**
   * Режим автоматической подстановки параметров строки запроса `?foo=bar` при сборке строки запроса перед `fetch()`.
   *
   *   + `0` - Устанавливает режим {@link URLSearchParams.set()}. По умолчанию.
   *   + `1` - Устанавливает режим {@link URLSearchParams.append()}
   */
  readonly queryAppendMode: TUrlQueryAppendMode
  /**
   * Режим наследования хеша строки `url` при расширении конфигураций.
   *
   *   + `0` - `#hash` не наследуется. По умолчанию.
   *   + `1` - Наследуется(переопределяется), если явно не задан.
   */
  readonly hashExtendsMode: TUrlHashExtendsMode
}

/**
 * Компоненты `URL`.
 */
type TNormalizedUrlComponents = {
  /**
   * Валидный домен с протоколом. Пример: `https://site.com`.
   */
  origin: string
  /**
   * Путь относительно домена сайта. Может быть пустым.
   */
  path: PathComponents
  /**
   * Набор параметров. Может быть пустым.
   */
  query: UrlQueryParams
  /**
   * Хеш `#hash` без решетки или `null`.
   */
  hash: null | string
}

/**
 * Опциональные компоненты `URL`.
 */
type TUrlFragments = {
  /**
   * Пример: `https://site.com`. Строка или `URL` будут очищены от компонентов пути до {@link URL.origin}.
   */
  origin?: undefined | null | string | URL
  /**
   * Путь относительно домена сайта. Может быть пустым.
   */
  path?: undefined | null | string | PathComponents
  /**
   * Набор параметров. Может быть пустым.
   */
  query?: undefined | null | TUrlQueryOptions | UrlQueryParams
  /**
   * Хеш `#hash` или `null`. Решетки `#` будут удалены и необязательна. Пример: `'###foo' -> 'foo'`.
   */
  hash?: undefined | null | string
}

/**
 * Режимы расширения параметров `URL` `?foo=bar` и `#hash`.
 */
type TUrlConfigOptions = UOptional<TUrlExtendsOptions>

/**
 * Нормализует опции режимов расширения `URL`, возвращая замороженный объект с пользовательскими или дефолтными значениями.
 *
 * @param options Опции режимов расширения URL.
 */
function normalizeUrlExtendsOptions (options: undefined | null | TUrlConfigOptions): TUrlExtendsOptions {
  return Object.freeze({
    queryExtendsMode: (options && (options.queryExtendsMode === 1 || options.queryExtendsMode === 2)) ? options.queryExtendsMode : 0,
    queryAppendMode: (options && options.queryAppendMode === 1) ? 1 : 0,
    hashExtendsMode: (options && options.hashExtendsMode === 1) ? 1 : 0
  })
}

/**
 * Возвращает `URL` или `null`(если конструктор завершился ошибкой).
 *
 * @param url Строка вида `https://site.com/your/path`.
 */
function parsedUrlOrNull (url: string): null | URL {
  try {
    // Поддержка URL.parse(url) пока ограничена
    // https://developer.mozilla.org/en-US/docs/Web/API/URL/parse_static
    // https://caniuse.com/mdn-api_url_parse_static
    return new URL(url)
  } catch (_) {
    // Здесь нельзя показывать предупреждений - ошибка будет всегда при расширении маршрута и проверке абсолютного пути.
    // console.warn('Строка не является абсолютным URL-адресом.', e)
  }
  return null
}

/**
 * Извлекает из строки `URL` только часть {@link URL.origin}. Если строка не имеет абсолютного пути с протоколом, возвратит `null`.
 *
 * @param url Строка вида `https://site.com/your/path`.
 */
function urlOriginOrNull (url: string): null | string {
  return parsedUrlOrNull(url)?.origin.replace(re.endSlash, '') ?? null
}

/**
 * Возвращает строку, после решетки `#` или, если она пуста, `null`.
 *
 * @param hash Предположительный хеш строки `URL`.
 */
function urlHashOrNull (hash?: undefined | null | string): null | string {
  if (isString(hash)) {
    const cleaned = hash.replace(re.urlHash, '')
    return cleaned ? cleaned : null
  }
  return null
}

/**
 * Возвращает компоненты пути, оборачивая `path` и `query` в соответствующие вспомогательные классы.
 *
 * @param url            Валидный объект {@link URL}.
 * @param extendsOptions Опции, которые необходимы для {@link UrlQueryParams}.
 */
function _extractUrlComponents (url: URL, extendsOptions: Pick<TUrlExtendsOptions, 'queryExtendsMode' | 'queryAppendMode'>): TNormalizedUrlComponents {
  return {
    origin: url.origin.replace(re.endSlash, ''),
    path: new PathComponents(url.pathname, false),
    query: new UrlQueryParams(url.searchParams, extendsOptions.queryExtendsMode, extendsOptions.queryAppendMode),
    hash: urlHashOrNull(url.hash)
  }
}

const _EXTENDS_MARKER = Symbol()

/**
 * Нормализует компоненты `URL`.
 *
 * @param url Один из допустимых вариантов компонентов `URL`.
 * @param extendsOptions Опции расширения `query` праметров.
 */
function normalizeUrlComponents (url: undefined | null | string | URL | PathComponents | TUrlFragments, extendsOptions: Pick<TUrlExtendsOptions, 'queryExtendsMode' | 'queryAppendMode'>): { [K in keyof TNormalizedUrlComponents]: null | TNormalizedUrlComponents[K] } {
  if (url instanceof URL) {
    return _extractUrlComponents(url, extendsOptions)
  }
  if (isNonemptyString(url)) {
    const parsedUrl = parsedUrlOrNull(url)
    if (parsedUrl) {
      return _extractUrlComponents(parsedUrl, extendsOptions)
    }
  }
  else if (url instanceof PathComponents) {
    return { origin: null, path: url, query: null, hash: null }
  }
  else if (isObject(url)) {
    return {
      origin: isNonemptyString(url.origin) ? urlOriginOrNull(url.origin) : null,
      path: (url.path instanceof PathComponents) ? url.path : isNonemptyString(url.path) ? new PathComponents(url.path, false) : null,
      query: url.query ? new UrlQueryParams(url.query, extendsOptions.queryExtendsMode, extendsOptions.queryAppendMode) : null,
      hash: urlHashOrNull(url.hash)
    }
  }
  return { origin: null, path: null, query: null, hash: null }
}

/**
 * Возвращает нормализованные компоненты `URL` или, если адрес не имеет абсолютного пути с протоколом, поднимает ошибку.
 *
 * @param url Один из допустимых вариантов компонентов `URL`.
 * @param extendsOptions Опции расширения `query` праметров.
 */
function urlComponentsOrThrow (url: string | URL | PathComponents | TUrlFragments, extendsOptions: Pick<TUrlExtendsOptions, 'queryExtendsMode' | 'queryAppendMode'>): TNormalizedUrlComponents {
  const normalized = normalizeUrlComponents(url, extendsOptions)
  if (!normalized.origin) {
    throw new ConfigureError(errorDetails.ConfigureError(`Аргумент 'url' должен содержать абсолютный URL с протоколом, получено:${safeToJson(url)}.`))
  }
  if (!normalized.path) {
    normalized.path = new PathComponents(null, false)
  }
  if (!normalized.query) {
    normalized.query = new UrlQueryParams(null, extendsOptions.queryExtendsMode, extendsOptions.queryAppendMode)
  }
  return normalized as TNormalizedUrlComponents
}

/**
 * Конфигурация `URL`.
 */
class UrlConfig<T extends Record<string, string | number> = Record<string, string | number>> {
  protected readonly _origin: string
  protected readonly _path: PathComponents<T>
  protected readonly _query: UrlQueryParams
  protected readonly _hash: null | string
  protected readonly _extendsOptions: TUrlExtendsOptions

  /**
   * Создает неизменяемый инстанс компонентов `URL` на основе параметров или по умолчанию.
   *
   * **Warning:** Строка `url` или {@link TUrlFragments.origin} должны иметь валидный абсолютный `URL` с протоколом.
   * Если требуется создать `URL` для текущего хоста, воспользуйтесь {@link UrlConfig.createFromOrigin()}.
   *
   * @param url Один из допустимых вариантов компонентов `URL`.
   * @param extendsOptions Опции расширения.
   */
  constructor(url: string | URL | (Omit<TUrlFragments, 'origin'> & { origin: string }), extendsOptions?: undefined | null | TUrlConfigOptions) {
    if (url === _EXTENDS_MARKER as any) {
      this._origin = (extendsOptions as unknown as TNormalizedUrlComponents).origin
      this._path = (extendsOptions as unknown as TNormalizedUrlComponents).path as PathComponents<T>
      this._query = (extendsOptions as unknown as TNormalizedUrlComponents).query
      this._hash = (extendsOptions as unknown as TNormalizedUrlComponents).hash
      this._extendsOptions = (extendsOptions as unknown as { extendsOptions: TUrlExtendsOptions }).extendsOptions
    }
    else {
      const opts = normalizeUrlExtendsOptions(extendsOptions)
      const props = urlComponentsOrThrow(url, opts)
      this._origin = props.origin
      this._path = props.path as PathComponents<T>
      this._query = props.query
      this._hash = props.hash
      this._extendsOptions = opts
    }
  }

  get extendsOptions (): TUrlExtendsOptions {
    return this._extendsOptions
  }

  get origin (): string {
    return this._origin
  }

  get path (): PathComponents<T> {
    return this._path
  }

  get query (): UrlQueryParams {
    return this._query
  }

  get hash (): null | string {
    return this._hash
  }

  isEmpty (): boolean {
    return this._path.isTotalEmpty() && this._query.isEmpty() && !this._hash
  }

  _selfOrReplaceExtendsOptions (cfg: UrlConfig): UrlConfig {
    // NOTE: Здесь может быть несоответствие параметров и за глобальное определение параметров должен отвечать пользователь.
    if (cfg._extendsOptions.queryExtendsMode !== this._extendsOptions.queryExtendsMode ||
      cfg._extendsOptions.queryAppendMode !== this._extendsOptions.queryAppendMode ||
      cfg._extendsOptions.hashExtendsMode !== this._extendsOptions.hashExtendsMode) {
      console.warn('[UrlConfig] Пользовательские опции расширения маршрута должны совпадать с текущим UrlConfig, this/custom:', this._extendsOptions, cfg._extendsOptions)
      return new UrlConfig(
        // @ts-expect-error
        _EXTENDS_MARKER,
        {
          origin: cfg._origin,
          path: cfg._path,
          query: cfg._query,
          hash: cfg._hash,
          extendsOptions: this._extendsOptions
        }
      )
    }
    return cfg
  }

  /**
   * Расширение маршурута.
   *
   * **Note:** Как расширяется маршрут:
   *
   *  + Если аргумент окажется пустым, маршрут не расширяется и возвращается ссылка на текущий `this`.
   *  + Если строка или {@link TUrlFragments} приводятся к абсолютному `URL`, создается новый `UrlConfig` и никакие
   *    параметры не наследуются. Так же это относится к аргументу типа {@link UrlConfig}.
   *  + Строка приводится к {@link PathComponents} и расширяет текущий маршрут.
   *  + Компоненты {@link TUrlFragments} расширяют свои своиства.
   *
   * @param components Один из допустимых вариантов компонентов `URL`.
   */
  extends<E extends Record<string, string | number> = T> (
    components: undefined | null | string | PathComponents | UrlConfig | TUrlFragments
  ): UrlConfig<T & E> {
    if (components instanceof UrlConfig) {
      return this._selfOrReplaceExtendsOptions(components) as UrlConfig<T & E>
    }

    if (components instanceof PathComponents) {
      return new UrlConfig(
        // @ts-expect-error
        _EXTENDS_MARKER,
        {
          origin: this._origin,
          path: this._path.extends(components),
          query: (this._extendsOptions.queryExtendsMode || this._query.isEmpty()) ? this._query : new UrlQueryParams(null, this._extendsOptions.queryExtendsMode, this._extendsOptions.queryAppendMode),
          hash: this._extendsOptions.hashExtendsMode ? this._hash : null,
          extendsOptions: this._extendsOptions
        }
      )
    }

    if (isNonemptyString(components)) {
      // Если это абсолютный адрес, заменяем все полностью
      const url = parsedUrlOrNull(components)
      if (url) {
        const params = _extractUrlComponents(url, this._extendsOptions) as (TNormalizedUrlComponents & { extendsOptions: TUrlExtendsOptions })
        params.extendsOptions = this._extendsOptions
        return new UrlConfig(
          // @ts-expect-error
          _EXTENDS_MARKER, params
        )
      }
      // ... Иначе это путь
      return new UrlConfig(
        // @ts-expect-error
        _EXTENDS_MARKER,
        {
          origin: this._origin,
          path: this._path.extends(components),
          query: (this._extendsOptions.queryExtendsMode || this._query.isEmpty()) ? this._query : new UrlQueryParams(null, this._extendsOptions.queryExtendsMode, this._extendsOptions.queryAppendMode),
          hash: this._extendsOptions.hashExtendsMode ? this._hash : null,
          extendsOptions: this._extendsOptions
        }
      )
    }

    if (isObject(components)) {
      // Если есть origin, заменяем полностью
      const params = normalizeUrlComponents(components, this._extendsOptions)
      if (params.origin) {
        return new UrlConfig(
          // @ts-expect-error
          _EXTENDS_MARKER,
          {
            origin: params.origin,
            path: params.path ?? new PathComponents(null, false),
            query: params.query ?? new UrlQueryParams(null, this._extendsOptions.queryExtendsMode, this._extendsOptions.queryAppendMode),
            hash: params.hash,
            extendsOptions: this._extendsOptions
          }
        )
      }
      // ... иначе расширяем каждый из компонентов пути
      return new UrlConfig(
        // @ts-expect-error
        _EXTENDS_MARKER,
        {
          origin: this._origin,
          path: this._path.extends(params.path),
          query: this._query.extends(params.query),
          hash: this._extendsOptions.hashExtendsMode ? (params.hash ?? this._hash) : null,
          extendsOptions: this._extendsOptions
        }
      )
    }
    // Иначе это невалидный тип или nullish
    return this as UrlConfig<T & E>
  }

  /**
   * Заменяет протокол `http(s)?://` на соответствующий `ws(s)?://`.
   *
   * @param onlyOrigin Вернуть URL домена без пути и дополнительных параметров.
   */
  toWsUrl (onlyOrigin: null | boolean): UrlConfig<T> {
    if (re.wsProtocol.test(this._origin)) {
      if (onlyOrigin && !this.isEmpty()) {
        return new UrlConfig<any>(
          // @ts-expect-error
          _EXTENDS_MARKER,
          {
            origin: this._origin,
            path: this._path.isTotalEmpty() ? this._path : new PathComponents(null, false),
            query: this._query.isEmpty() ? this._query : new UrlQueryParams(null, this._extendsOptions.queryExtendsMode, this._extendsOptions.queryAppendMode),
            hash: null,
            extendsOptions: this._extendsOptions
          }
        )
      }
      return this
    }
    const wsProtocol = re.http.test(this._origin) ? 'ws://' : 'wss://'
    const origin = this._origin.replace(re.startProtocol, wsProtocol)
    const path = (onlyOrigin && !this._path.isTotalEmpty()) ? new PathComponents(null, false) : this._path
    const query = (onlyOrigin && !this._query.isEmpty()) ? new UrlQueryParams(null, this._extendsOptions.queryExtendsMode, this._extendsOptions.queryAppendMode) : this._query
    return new UrlConfig(
      // @ts-expect-error
      _EXTENDS_MARKER, { origin, path, query, hash: null, extendsOptions: this._extendsOptions }
    )
  }

  toMutable (): MutableUrl<T> {
    return new MutableUrl(this)
  }

  /**
   * Создает инстанс {@link UrlConfig} на основе {@link Location.origin}.
   */
  static createFromOrigin<T extends Record<string, string | number>> (
    components?: undefined | null | PathComponents<T> | Omit<TUrlFragments, 'origin'>,
    options?: undefined | null | TUrlConfigOptions
  ): UrlConfig<T> {
    return _createUrlConfigFromOrigin(components, options)
  }

  /**
   * Создает инстанс {@link UrlConfig} на основе {@link Location.host}, но заменяет протокол `http(s)`, на соответствующий `ws(s)`.
   */
  static createFromOriginWs<T extends Record<string, string | number>> (
    components?: undefined | null | PathComponents<T> | Omit<TUrlFragments, 'origin'>,
    options?: undefined | null | TUrlConfigOptions
  ): UrlConfig<T> {
    return _createUrlConfigFromOriginWs(components, options)
  }
}

function _createFrom (
  origin: string,
  components: undefined | null | PathComponents<any> | Omit<TUrlFragments, 'origin'>,
  options: undefined | null | TUrlConfigOptions
): UrlConfig<any> {
  const params: (Omit<TUrlFragments, 'origin'> & { origin: string }) = { origin }
  if (components instanceof PathComponents) {
    params.path = components as PathComponents<any>
  }
  else if (isObject(components)) {
    params.path = components.path
    params.query = components.query
    params.hash = components.hash
  }
  return new UrlConfig(params, options)
}

function _createUrlConfigFromOrigin<T extends Record<string, string | number>> (
  components?: undefined | null | PathComponents<T> | Omit<TUrlFragments, 'origin'>,
  options?: undefined | null | TUrlConfigOptions
): UrlConfig<T> {
  return _createFrom(document.location.origin, components, options)
}

function _createUrlConfigFromOriginWs<T extends Record<string, string | number>> (
  components?: undefined | null | PathComponents<T> | Omit<TUrlFragments, 'origin'>,
  options?: undefined | null | TUrlConfigOptions
): UrlConfig<T> {
  const { protocol, host } = document.location  // пример protocol:'http:', host:'127.0.0.1:7858'
  const wsProtocol = re.http.test(protocol) ? 'ws://' : 'wss://'
  return _createFrom(`${wsProtocol}${host}`, components, options)
}

class MutableUrl<T extends Record<string, number | string> = Record<string, number | string>> {
  protected readonly _cfg: UrlConfig<T>
  protected _path: MutablePathComponents<T>
  protected _query: null | URLSearchParams
  protected _hash: null | string
  protected _customPath: null | string = null

  constructor(cfg: UrlConfig<T>) {
    this._cfg = cfg
    this._path = this._cfg.path.toMutable()
    this._query = this._cfg.query.isEmpty() ? null : this._cfg.query.urlSearchParams()
    this._hash = cfg.hash
  }

  get queryAppendMode (): boolean {
    return !!this._cfg.extendsOptions.queryAppendMode
  }

  get origin (): string {
    return this._cfg.origin
  }

  get path (): MutablePathComponents<T> {
    return this._path
  }

  get query (): URLSearchParams {
    return this._query ?? (this._query = this._cfg.query.urlSearchParams())
  }

  get hash (): null | string {
    return this._hash
  }

  /**
   * Расширить/удалить последний путь строки `URL`. Этот путь может быть добавлен в пользовательские опции запросов и
   * всегда проверяется контекстом выполнения.
   */
  setPath (path: null | string): void {
    this._customPath = path
  }

  /**
   * Добавить параметры `URL` методом `URLSearchParams.set()`.
   *
   * **Note:** Методы {@link setQuery()} или {@link appendQuery()} должны выбираться на основе {@link queryAppendMode}.
   */
  setQuery (query: readonly (readonly [string, string | number])[]): void {
    const q = this.query
    for (const item of query) {
      q.set(item[0], `${item[1]}`)
    }
  }

  /**
   * Добавить параметры `URL` методом `URLSearchParams.append()`.
   *
   * **Note:** Методы {@link setQuery()} или {@link appendQuery()} должны выбираться на основе {@link queryAppendMode}.
   */
  appendQuery (query: readonly (readonly [string, string | number])[]): void {
    const q = this.query
    for (const item of query) {
      q.append(item[0], `${item[1]}`)
    }
  }

  /**
   * Добавить параметры `URL`. Метод добавления параметров `set/append` выбирается на основе {@link queryAppendMode}.
   *
   * Пораметры могут быть добавлены в пользовательские опции запросов и всегда проверяется контекстом выполнения.
   */
  addQuery (query: readonly (readonly [string, string | number])[]): void {
    if (this.queryAppendMode) {
      this.appendQuery(query)
    }
    else {
      this.setQuery(query)
    }
  }

  /**
   * Заменить/удалить `#hash` строки `URL`. Строка не должна иметь решетку `#`, которая будет вставлена автоматически.
   */
  setHash (hash: null | string): void {
    this._hash = hash
  }

  toString (): string {
    const fullpath = [this._cfg.origin, '/']
    let hasEndSlash
    if (this.path.isEmpty()) {
      hasEndSlash = true
    }
    else {
      fullpath.push(this.path.toString())
      hasEndSlash = this.path.hasEndSlash
      if (hasEndSlash) {
        fullpath.push('/')
      }
    }
    if (this._customPath) {
      if (hasEndSlash) {
        fullpath.push(this._customPath)
      }
      else {
        fullpath.push('/', this._customPath)
      }
    }
    if (this._query?.size) {
      fullpath.push('?', this._query.toString())
    }
    if (this._hash) {
      fullpath.push('#', this._hash)
    }
    return fullpath.join('')
  }
}

/**
 * Компоненты `URL`.
 */
type TUrlComponents = {
  /**
   * Динамический путь, который может расширять константный путь определенный для маршрута:
   *
   *  + `string` - Строка подставляется в конец пути.
   *  + `Record | []` - Объект или массив оцениваются как подстановочные параметры в {@link PathComponents}.
   */
  path: undefined | null | string | Record<string, string | number> | [string, string | number][] | (readonly ([string, string | number])[]) | ((readonly [string, string | number])[]) | (readonly (readonly [string, string | number])[])
  /**
   * Набор `query` параметров.
   */
  query: undefined | null | Record<string, string | number> | [string, string | number][] | (readonly ([string, string | number])[]) | ((readonly [string, string | number])[]) | (readonly (readonly [string, string | number])[])
  /**
   * Хеш `#hash` без решетки или `null`.
   */
  hash: undefined | null | string
}

function _useUrlPath (url: MutableUrl, path: Exclude<TUrlComponents['path'], null | undefined>): void {
  if (isString(path)) {
    url.setPath(path)
  }
  else if (isArray(path)) {
    url.path.useEntries(path as [string, string | number][])
  }
  else {
    url.path.use(path as Record<string, string | number>)
  }
}

function _useUrlQuery (url: MutableUrl, query: Exclude<TUrlComponents['query'], null | undefined>): void {
  if (isArray(query)) {
    url.addQuery(query)
  }
  else {
    url.addQuery(Object.entries(query))
  }
}

function useUrlComponents (url: MutableUrl, path: string | TUrlComponents): void {
  if (isString(path)) {
    url.setPath(path)
  }
  else {
    if (path.path) {
      _useUrlPath(url, path.path)
    }
    if (path.query) {
      _useUrlQuery(url, path.query)
    }
    if (path.hash) {
      url.setHash(path.hash)
    }
  }
}

export {
  type TUrlHashExtendsMode,
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
  type TUrlComponents,
  useUrlComponents
}
