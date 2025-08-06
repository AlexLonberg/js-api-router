import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type interfaceImplements,
  interfaceDefineHasInstanceMarker
} from 'ts-interface-core'
import type { AbortError, TimeoutError } from '../errors.js'

/**
 * Статусы завершения {@link InterruptControllerLike}.
 */
const INTERRUPT_CONTROLLER_EXIT_STATUSES = Object.freeze({
  /**
   * Начальное состояние в котором не сработал ни один механизм прерывания.
   */
  none: 0,
  /**
   * Сработал механизм `timeout`.
   */
  timeout: 1,
  /**
   * Сработал прерывание по `AbortSignal`.
   */
  abort: 2,
  /**
   * Сработало прерывание по `AbortSignal` с флагом мягкого завершения.
   */
  soft: 3
} as const)
/**
 * Статусы завершения {@link InterruptControllerLike}.
 * Одна из констант {@link INTERRUPT_CONTROLLER_EXIT_STATUSES}.
 */
type TInterruptControllerExitStatuses = typeof INTERRUPT_CONTROLLER_EXIT_STATUSES
/**
 * Статусы завершения {@link InterruptControllerLike}.
 * Одна из констант {@link INTERRUPT_CONTROLLER_EXIT_STATUSES}.
 */
type TInterruptControllerExitStatus = TInterruptControllerExitStatuses[keyof TInterruptControllerExitStatuses]

/**
 * Универсальный интерфейс контроллера прерывания.
 *
 * **Note:** Этот класс можно реализовать через {@link interfaceImplements}.
 */
abstract class InterruptControllerLike {
  /**
   * Жив ли контроллер.
   */
  abstract readonly alive: boolean
  /**
   * Статус прерывания. Актуально, если `alive:false`.
   *
   * @example
   * ```ts
   * if (!controller.alive) {
   *   if (controller.status) {
   *     // сработал один из механизмов прерывания
   *   }
   *   else {
   *     // контроллер был деактивирован
   *   }
   * }
   * ``
   */
  abstract readonly status: TInterruptControllerExitStatus

  /**
   * Добавить функцию обработчик прерывания. Функция вызывается только один раз
   *
   * @param callback Функция принимающая:
   *                  + `status` - Один из кодов статуса {@link INTERRUPT_CONTROLLER_EXIT_STATUSES} не включая `none`.
   *                  + `error`  - Ошибка соответствующая статусу. Для `abort|soft` это {@link AbortError}.
   */
  abstract on (callback: ((status: TInterruptControllerExitStatuses['timeout' | 'abort' | 'soft'], error: AbortError | TimeoutError) => any)): void
  /**
   * Удалить ранее добавленный обработчик. Имеет смысл, если контроллер еще _"живой"_.
   */
  abstract off (callback: ((status: TInterruptControllerExitStatuses['timeout' | 'abort' | 'soft'], error: AbortError | TimeoutError) => any)): void

  /**
   * Деактивирует контроллер прерывания и переводит его  в состояние `alive:false`.
   *
   * Функции-обработчики прерывания не вызываются.
   */
  abstract disable (): void
}
interfaceDefineHasInstanceMarker(InterruptControllerLike)

export {
  INTERRUPT_CONTROLLER_EXIT_STATUSES,
  type TInterruptControllerExitStatuses,
  type TInterruptControllerExitStatus,
  InterruptControllerLike
}
