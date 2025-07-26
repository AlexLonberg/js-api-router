import type { AnyFunction, TNonemptyString } from './types.js'

const _hasOwn = ('hasOwn' in Object && typeof Object.hasOwn === 'function')
  ? Object.hasOwn
  : (obj: any, key: string | number | symbol) => Object.prototype.hasOwnProperty.call(obj, key)

/**
 * Наличие собственного `enumerable` свойства объекта.
 *
 * @param obj Целевой объект.
 * @param key Искомое имя свойства.
 * @returns
 */
function hasOwn<T extends object, K extends string | number | symbol> (obj: T, key: K):
  obj is (T & { [_ in K]: K extends keyof T ? T[K] : unknown }) {
  return _hasOwn(obj, key)
}

/**
 * Значение `undefined`.
 */
function isUndefined (value: any): value is undefined {
  return typeof value === 'undefined'
}

/**
 * Значение `undefined | null`.
 */
function isNullish (value: any): value is (undefined | null) {
  return typeof value === 'undefined' || value === null
}

/**
 * Является ли аргумент `value` Symbol.
 */
function isSymbol (value: any): value is symbol {
  return typeof value === 'symbol'
}

/**
 * Значение `boolean`.
 */
function isBoolean (value: any): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Является ли аргумент `value` строкой.
 */
function isString (value: any): value is string {
  return typeof value === 'string'
}

/**
 * Является ли аргумент `value` непустой строкой.
 */
function isNonemptyString (value: any): value is TNonemptyString {
  return typeof value === 'string' && value.length > 0
}

/**
 * Является ли значение `value` объектом.
 */
function isObject<T> (value: T): value is (object & T) {
  return value !== null && typeof value === 'object'
}

/**
 * Является ли значение `value` структуроподобным объектом `{...}` исключая массивы `[]`.
 */
function isPlainObject<T> (value: T): value is (object & T) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Является ли значение `value` массивом.
 */
function isArray<T> (value: T): value is (any[] & T) {
  return Array.isArray(value)
}

/**
 * Является ли значение `value` функцией.
 */
function isFunction<T extends (AnyFunction | { new(..._: any[]): any })> (value: any): value is T {
  return typeof value === 'function'
}

const MAP_FROZEN_MARKER = Symbol('MAP_FROZEN_MARKER')

/**
 * Устанавливает свойства `set/delete/clear` для предотвращения изменения `Map`.
 *
 * @param map Инстанс `Map`, объект не должен быть запечатанным или нерасширяемым.
 */
function freezeMap<T extends Map<any, any>> (map: T): T extends Map<infer K, infer V> ? ReadonlyMap<K, V> : ReadonlyMap<any, any> {
  // Можно проверить только Object.isFrozen(...),
  // для sealed и preventExtensions ошибки не будет, но и смысла тоже - свойства все равно не изменятся
  if ((MAP_FROZEN_MARKER in map) || !Object.isExtensible(map)) {
    return map as any
  }
  const setDs = Object.getOwnPropertyDescriptor(map, 'set')
  if (!setDs || setDs.configurable) {
    Object.defineProperty(map, 'set', {
      enumerable: false,
      // В возвращаемом ReadonlyMap не должно быть свойства set(). Можем кинуть ошибку, но только для
      value: (..._: any) => { throw new TypeError('Map is frozen') }
    })
  }
  const deleteDs = Object.getOwnPropertyDescriptor(map, 'delete')
  if (!deleteDs || deleteDs.configurable) {
    Object.defineProperty(map, 'delete', {
      enumerable: false,
      value: (_: any) => false
    })
  }
  const clearDs = Object.getOwnPropertyDescriptor(map, 'clear')
  if (!clearDs || clearDs.configurable) {
    Object.defineProperty(map, 'clear', {
      enumerable: false,
      value: () => { /**/ }
    })
  }
  const markerDs = Object.getOwnPropertyDescriptor(map, MAP_FROZEN_MARKER)
  if (!markerDs || markerDs.configurable) {
    Object.defineProperty(map, MAP_FROZEN_MARKER, {
      enumerable: false,
      value: true
    })
  }
  return map as any
}

/**
 * Пытается привести `value` к Json-строке или возвращает пустую строку.
 */
function safeToJson (value: any): string {
  try {
    return JSON.stringify(value)
  } catch (_) { /**/ }
  return ''
}

function booleanOrNull (value?: any): null | boolean {
  return typeof value === 'boolean' ? value : null
}

export {
  hasOwn,
  isUndefined,
  isNullish,
  isSymbol,
  isBoolean,
  isString,
  isNonemptyString,
  isObject,
  isPlainObject,
  isArray,
  isFunction,
  freezeMap,
  safeToJson,
  booleanOrNull
}
