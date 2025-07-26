import { isBoolean, isString, isObject } from '../utils.js'

function valueToString (value: any): string {
  if (isString(value)) {
    return value
  }
  if (Number.isFinite(value)) {
    return (value as number).toString(10)
  }
  if (isBoolean(value)) {
    return value ? 'true' : 'false'
  }
  return ''
}

/**
 * Необработанные параметры строки запроса `?foo=bar`.
 */
type TUrlQueryOptions = string | [string, undefined | null | string | number | boolean][] | (readonly [string, undefined | null | string | number | boolean])[] | (readonly (readonly [string, undefined | null | string | number | boolean])[]) | Record<string, string | number | boolean | null | undefined> | URLSearchParams

/**
 * Режим слияния параметров строки `url` при расширении конфигураций.
 *
 *   + `0` - Строка `?foo=bar` не наследуется. По умолчанию.
 *   + `1` - Оставляет ключи которых нет в новых параметрах, и добавляет новые параметры.
 *   + `2` - Сливает все ключи функцией {@link URLSearchParams.append()}
 */
type TUrlQueryExtendsMode = 0 | 1 | 2

/**
 * Режим автоматической подстановки параметров строки запроса `?foo=bar` непосредственно перед `fetch()`.
 *
 *   + `0` - Устанавливает режим {@link URLSearchParams.set()}. По умолчанию.
 *   + `1` - Устанавливает режим {@link URLSearchParams.append()}.
 */
type TUrlQueryAppendMode = 0 | 1

/**
 * Валидирует элементы массива пар и приводит к виду `[string, string][]`.
 *
 * @param queryArray Массив пар параметров.
 */
function normalizeArrayQueryParams (queryArray: readonly [string, string | number | boolean | null | undefined][] | readonly (readonly [string, string | number | boolean | null | undefined])[]): [string, string][] {
  const array: [string, string][] = []
  for (const item of queryArray) {
    if (Array.isArray(item) && item.length === 2 && isString(item[0])) {
      array.push([item[0], valueToString(item[1])])
    }
  }
  return array
}

/**
 * Валидирует свойства объекта и приводит к виду `[string, string][]`.
 *
 * @param queryObject Объект с параметрами.
 */
function normalizeObjectQueryParams (queryObject: Record<string, any>): [string, string][] {
  const array: [string, string][] = []
  for (const [key, value] of Object.entries(queryObject)) {
    array.push([key, valueToString(value)])
  }
  return array
}

/**
 * Валидирует параметры и возвращает стандартный {@link URLSearchParams} или `null`, если нет ни одного параметра.
 *
 * @param params Допустимый объект параметров.
 */
function normalizeUrlQueryParams (params?: undefined | null | TUrlQueryOptions): null | URLSearchParams {
  if (!params) {
    return null
  }
  const ins: null | URLSearchParams = (params instanceof URLSearchParams || isString(params))
    ? new URLSearchParams(params)
    : Array.isArray(params)
      ? new URLSearchParams(normalizeArrayQueryParams(params))
      : isObject(params)
        ? new URLSearchParams(normalizeObjectQueryParams(params))
        : null
  return (ins && ins.size > 0) ? ins : null
}

const _EXTENDS_MARKER = Symbol()

/**
 * Обертка над {@link URLSearchParams} для возможности расширения параметров маршрута.
 */
class UrlQueryParams {
  protected readonly _params: null | URLSearchParams
  protected readonly _extendsMode: TUrlQueryExtendsMode
  protected readonly _appendMode: TUrlQueryAppendMode

  constructor(params: undefined | null | TUrlQueryOptions | UrlQueryParams, extendsMode: TUrlQueryExtendsMode, appendMode: TUrlQueryAppendMode) {
    if (params === _EXTENDS_MARKER as any) {
      this._params = extendsMode as unknown as (null | URLSearchParams)
      this._extendsMode = (appendMode as unknown as [TUrlQueryExtendsMode])[0]
      this._appendMode = (appendMode as unknown as [any, TUrlQueryAppendMode])[1]
    }
    else {
      const normalized = (params instanceof UrlQueryParams) ? params._params : normalizeUrlQueryParams(params)
      this._params = (normalized && normalized.size > 0) ? normalized : null
      this._extendsMode = (extendsMode === 1 || extendsMode === 2) ? extendsMode : 0
      this._appendMode = appendMode === 1 ? 1 : 0
    }
  }

  get extendsMode (): TUrlQueryExtendsMode {
    return this._extendsMode
  }

  get appendMode (): TUrlQueryAppendMode {
    return this._appendMode
  }

  isEmpty (): boolean {
    return !this._params
  }

  toString (): string {
    return this._params?.toString() ?? ''
  }

  _selfOrReplaceExtendsOptions (cfg: UrlQueryParams): UrlQueryParams {
    if (cfg._extendsMode !== this._extendsMode || cfg._appendMode !== this._appendMode) {
      console.warn('[UrlQueryParams] Пользовательские опции расширения должны совпадать с текущим UrlQueryParams, this/custom:', { extendsMode: this._extendsMode, appendMode: this._appendMode }, { extendsMode: cfg._extendsMode, appendMode: cfg._appendMode })
      return new UrlQueryParams(
        // @ts-expect-error
        _EXTENDS_MARKER,
        cfg._params, [this._extendsMode, this._appendMode]
      )
    }
    return cfg
  }

  extends (params: undefined | null | TUrlQueryOptions | UrlQueryParams): UrlQueryParams {
    let normalized: URLSearchParams | null

    // Если параметры не наследуются
    if (this._extendsMode === 0) {
      if (params instanceof UrlQueryParams) {
        return this._selfOrReplaceExtendsOptions(params)
      }
      normalized = normalizeUrlQueryParams(params)
      // Не создаем инстанс, если он уже пустой
      if (this.isEmpty() && !normalized) {
        return this
      }
      return new UrlQueryParams(
        // @ts-expect-error
        _EXTENDS_MARKER,
        normalized, [this._extendsMode, this._appendMode]
      )
    }

    normalized = (params instanceof UrlQueryParams) ? params._params : normalizeUrlQueryParams(params)

    // Нечего сливать
    if (!normalized) {
      return this
    }

    // Если текущий инстанс пустой
    if (!this._params) {
      return new UrlQueryParams(
        // @ts-expect-error
        _EXTENDS_MARKER,
        normalized, [this._extendsMode, this._appendMode]
      )
    }

    // Иначе сливаем
    let newParams: URLSearchParams
    if (this._extendsMode === 1) {
      newParams = new URLSearchParams()
      for (const [key, value] of this._params) {
        if (!normalized.has(key)) {
          newParams.append(key, value)
        }
      }
      for (const [key, value] of normalized) {
        newParams.append(key, value)
      }
    }
    else /* extendsMode === 2 */ {
      newParams = new URLSearchParams(this._params)
      for (const [key, value] of normalized) {
        newParams.append(key, value)
      }
    }

    return new UrlQueryParams(
      // @ts-expect-error
      _EXTENDS_MARKER,
      newParams, [this._extendsMode, this._appendMode]
    )
  }

  urlSearchParams (): URLSearchParams {
    return this._params ? new URLSearchParams(this._params) : new URLSearchParams()
  }
}

export {
  type TUrlQueryOptions,
  type TUrlQueryExtendsMode,
  type TUrlQueryAppendMode,
  normalizeArrayQueryParams,
  normalizeObjectQueryParams,
  normalizeUrlQueryParams,
  UrlQueryParams
}
