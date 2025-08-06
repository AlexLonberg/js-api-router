import {
  interfaceDefineHasInstanceMarker,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type interfaceImplements
} from 'ts-interface-core'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ApiRouterError } from '../errors.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { TEndpointBaseConfig } from '../configs/types.js'
import type { ContextLike } from './ContextLike.js'

/**
 * Интерфес промежуточных обработчиков.
 *
 * **Note:** `MiddlewareLike` универсален и может применяться как для трансформации запроса, так и для обработки ошибок.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class MiddlewareLike<TIn, TOut> {
  /**
   * Уникальное имя класса.
   */
  abstract readonly kind: string

  /**
   * Функция обработки/трансформации значения.
   *
   * @param ctx   Один из подтипов {@link ContextLike}.
   * @param value Текущее значение.
   */
  abstract process (ctx: ContextLike, value: TIn): TOut | Promise<TOut>

  /**
   * Функция обработки ошибки должна вернуть:
   *
   *   + `return value` - значение будет передано следующему обработчику ошибки.
   *   + `return ctx.passthrough()` - пропустить этот обработчик и передать `value + error` дальше.
   *   + `throw ApiRouterError` - один из подтипов стандартной ошибки {@link ApiRouterError}, возвращаемый клиенту.
   *
   * @param ctx   Один из подтипов {@link ContextLike}.
   * @param value Текущее значение. Например обработчик `http` вернет `Response` со статусами отличными от `2xx`.
   * @param error Текущая ошибка. Ошибка не изменяется и может трансформироваться обработчиками.
   */
  abstract processError (ctx: ContextLike, value: any, error: any): any
}
interfaceDefineHasInstanceMarker(MiddlewareLike)

/**
 * Конструктор {@link MiddlewareLike}.
 */
interface TMiddlewareConstructor<TIn, TOut> {
  readonly kind: string
  new(): MiddlewareLike<TIn, TOut>
}

/**
 * Базовый класс промежуточных обработчиков.
 *
 * **Note:** Класс `Middleware` универсален и может применяться как для трансформации запроса, так и для обработки ошибок.
 *
 * Переопределите необходимые методы:
 *
 *   + `process()` - Для {@link TEndpointBaseConfig} `executor/preprocessor/postprocessor`
 *   + `processError()` - {@link TEndpointBaseConfig.errorprocessor} .Применяются только после `executor`(включительно)
 *                        и не влияют на результаты `preprocessor` или `AbortSignal` и `timeout`.
 */
abstract class Middleware<TIn, TOut> extends MiddlewareLike<TIn, TOut> {
  process (ctx: ContextLike, _value: TIn): TOut | Promise<TOut> {
    return ctx.passthrough()
  }
  processError (ctx: ContextLike, _value: any, _error: any): any {
    return ctx.passthrough()
  }
}

export {
  MiddlewareLike,
  type TMiddlewareConstructor,
  Middleware
}
