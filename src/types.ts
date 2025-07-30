import type { TErrorCodes, IErrorLike, ApiRouterError } from './errors.js'

type Nullish = undefined | null
type Primitive = undefined | null | boolean | number | string | bigint | symbol
type NonNullishPrimitive = boolean | number | string | bigint | symbol
type NonNullish = NonNullishPrimitive | object

type JsonPrimitive = null | boolean | number | string
type JsonObject = { [k: string]: JsonPrimitive | JsonArray | JsonObject }
type JsonArray = (JsonPrimitive | JsonArray | JsonObject)[]
type JsonLike = JsonPrimitive | JsonArray | JsonObject

/**
 * Совместимый с объектами тип.
 *
 * Замена для строгих JsonObject и JsonArray, которые не всегда работают с интерфейсами из-за ошибки
 * "Index signature for type 'string' is missing in type T", поэтому только менее строгая типизация.
 */
type ArrOrObj = ({ [k: string]: any } | any[])

type AnyFunction = ((..._: any[]) => any)

type UMutable<T extends object> = { -readonly [K in keyof T]: T[K] }
type UOptional<T extends object> = { -readonly [K in keyof T]?: undefined | null | T[K] }
type URecordToEntries<T extends Record<string, any>> = { [K in keyof T]: [K, T[K]] }[keyof T][]

/**
 * Непустая строка.
 */
type TNonemptyString = string & { __TNonemptyString: never }
/**
 * `number >= 0`.
 */
type TNonNegNumber = number & { __TNonNegNumber: never }
/**
 * `number > 0`.
 */
type TPositiveNumber = number & { __TPositiveNumber: never }
/**
 * `integer >= 0`.
 */
type TNonNegInteger = number & { __TNonNegInteger: never }
/**
 * `integer > 0`.
 */
type TPositiveInteger = number & { __TPositiveInteger: never }

/**
 * `number >= 0`.
 */
function isNonNegNumber (value?: any | TNonNegNumber): value is TNonNegNumber {
  return Number.isFinite(value) && value >= 0
}

/**
 * `number > 0`.
 */
function isPositiveNumber (value?: any | TPositiveNumber): value is TPositiveNumber {
  return Number.isFinite(value) && value > 0
}

/**
 * `integer >= 0`.
 */
function isNonNegInteger (value?: any | TNonNegInteger): value is TNonNegInteger {
  return Number.isSafeInteger(value) && value > 0
}

/**
 * `integer > 0`.
 */
function isPositiveInteger (value?: any | TPositiveInteger): value is TPositiveInteger {
  return Number.isSafeInteger(value) && value > 0
}

/**
 * Возвращает `number >= 0` или `null`.
 */
function nonNegNumberOrNull (value?: any | TNonNegNumber): null | TNonNegNumber {
  return isNonNegNumber(value) ? value : null
}

/**
 * Возвращает `number > 0` или `null`.
 */
function positiveNumberOrNull (value?: any | TPositiveNumber): null | TPositiveNumber {
  return isPositiveNumber(value) ? value : null
}

/**
 * Возвращает `integer >= 0` или `null`.
 */
function nonNegIntegerOrNull (value?: any | TNonNegInteger): null | TNonNegInteger {
  return isNonNegInteger(value) ? value : null
}

/**
 * Возвращает `integer > 0` или `null`.
 */
function positiveIntegerOrNull (value?: any | TPositiveInteger): null | TPositiveInteger {
  return isPositiveInteger(value) ? value : null
}

/**
 * `number === 0|1`.
 */
type TNumericBool = number & { __TNumericBool: never }

/**
 * `number === 0|1`.
 */
function isNumericBool (value: any): value is TNumericBool {
  return (value === 0) || (value === 1)
}

/**
 * Возвращает `integer === 0|1` или `null`.
 */
function numericBoolOrNull (value: any): null | TNumericBool {
  return isNumericBool(value) ? value : null
}

/**
 * Функция получения `number > 0`.
 */
type TFnRetryDelay = ((attempt: number) => TPositiveNumber) & { __TFnRetryDelay: never }

/**
 * Возвращает функцию получения `delay` или `null`.
 *
 * Пользовательская функция не может быть проверена и возвращается как есть.
 */
function fnRetryDelayOrNull (value?: any | number | ((attempt: number) => number)): null | TFnRetryDelay {
  return (typeof value === 'function') ? value : isPositiveNumber(value) ? ((_: any) => value) as TFnRetryDelay : null
}

/**
 * Результат обработанного ответа.
 *
 * Если запрос завершился ошибкой или сервер прислал ошибку, пользовательский обработчик может установить шаблонный
 * {@link IErrorLike} с собственными кодами и сообщениями.
 *
 * Пример:
 *  + Прерывание запроса установит код {@link TErrorCodes.AbortError}.
 *  + Пользовательский {@link ResponseHandler.handle()} может прочитать тело ошибки и обновить поля {@link IErrorLike}.
 */
type TResponse<T> =
  { ok: true, value: T, error?: undefined | null } |
  { ok: false, value: null, error: ApiRouterError }

/**
 * Заглушка(функция), которая ничего не возвращает.
 */
const uselessFunctionStub_ = ((..._: any[]): any => { /**/ })

export {
  type Nullish,
  type Primitive,
  type NonNullishPrimitive,
  type NonNullish,
  type JsonPrimitive,
  type JsonObject,
  type JsonArray,
  type JsonLike,
  type ArrOrObj,
  type AnyFunction,
  type UMutable,
  type UOptional,
  type URecordToEntries,
  type TNonemptyString,
  type TNonNegNumber,
  type TPositiveNumber,
  type TNonNegInteger,
  type TPositiveInteger,
  isNonNegNumber,
  isPositiveNumber,
  isNonNegInteger,
  isPositiveInteger,
  nonNegNumberOrNull,
  positiveNumberOrNull,
  nonNegIntegerOrNull,
  positiveIntegerOrNull,
  type TNumericBool,
  isNumericBool,
  numericBoolOrNull,
  type TFnRetryDelay,
  fnRetryDelayOrNull,
  type TResponse,
  uselessFunctionStub_
}
