import { type AbortError, errorDetails, TimeoutError } from '../errors.js'
import { type TPositiveNumber, uselessFunctionStub_ } from '../types.js'
import {
  type TInterruptControllerExitStatus,
  type TInterruptControllerExitStatuses,
  INTERRUPT_CONTROLLER_EXIT_STATUSES,
  InterruptControllerLike,
} from '../interfaces/InterruptControllerLike.js'
import { SubscriberOptimizer } from './SubscriberOptimizer.js'

/**
 * Константа, которая может быть передана пользователем в {@link AbortController.abort()}, для _"smart/soft"_ прерывания запроса.
 *
 * Запрос не будет прерван, если ответ уже получен от сервера и ожидает только обработку внутренними пользовательскими
 * `middlewares`:
 *
 * ```ts
 * // Запрос будет прерван, если он не 'postprocessing' или 'finished'
 * if (ctx.stage !== 'postprocessing') {
 *    abortController.abort(ABORT_ONLY_BEFORE_RESPONSE)
 * }
 *
 * // Запрос не будет прерван
 * if (ctx.stage === 'postprocessing') {
 *    abortController.abort(ABORT_ONLY_BEFORE_RESPONSE)
 * }
 * ```
 */
const ABORT_ONLY_BEFORE_RESPONSE = Symbol('ABORT_ONLY_BEFORE_RESPONSE')

/**
 * Функция обработчик для {@link TimeoutController}.
 *
 * @param status Статус, который для этой функции всегда {@link TInterruptControllerExitStatuses.timeout} и здесь он не имеет смысла.
 * @param error  Ошибка {@link TimeoutError}
 */
type TTimeoutControllerCallback = ((status: TInterruptControllerExitStatuses['timeout'], error: TimeoutError) => any)

/**
 * Легковесная альтернатива {@link AbortTimeoutController} без создания обертки `AbortSignal` и только для `timeout`.
 */
class TimeoutController extends InterruptControllerLike {
  protected readonly _withoutError: boolean
  protected _callback: TTimeoutControllerCallback
  protected _alive: boolean = true
  protected _status: TInterruptControllerExitStatuses['none' | 'timeout'] = INTERRUPT_CONTROLLER_EXIT_STATUSES.none
  protected _tid: ReturnType<typeof setTimeout> = undefined as any

  protected readonly _on = () => {
    this._alive = false
    this._status = INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout
    const e = this._withoutError ? (null as unknown as TimeoutError) : new TimeoutError(errorDetails.TimeoutError('Прерывание по timeout.'))
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback(this._status, e)
    }
    else {
      SubscriberOptimizer.safe(this._callback, this._status, e)
    }
  }

  /**
   * Создает совместимый интерфейс {@link InterruptControllerLike}.
   *
   * @param callback     Обязательная функция, которая будет вызвана со статусом `1`.
   * @param timeout      Значение `number > 0`.
   * @param withoutError По умолчанию контроллер генерирует ошибку {@link TimeoutError}. Установите этот параметр
   *                     в `true`, чтобы обработчик не генерировал ошибку и передал вторым параметром `null`.
   */
  constructor(callback: TTimeoutControllerCallback, timeout: TPositiveNumber, withoutError?: undefined | null | boolean) {
    super()
    this._callback = callback
    this._withoutError = !!withoutError
    this._tid = setTimeout(this._on, timeout)
  }

  get alive (): boolean {
    return this._alive
  }

  get status (): TInterruptControllerExitStatuses['none' | 'timeout'] {
    return this._status
  }

  on (callback: TTimeoutControllerCallback): void {
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback.on(callback)
    }
    else {
      this._callback = SubscriberOptimizer.wrap(this._callback, callback)
    }
  }

  off (callback: TTimeoutControllerCallback): void {
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback.off(callback)
    }
    else if (this._callback === callback) {
      this._callback = uselessFunctionStub_
    }
  }

  disable (): void {
    this._alive = false
    clearTimeout(this._tid)
  }
}

/**
 * Функция обработчик для {@link AbortTimeoutController}.
 *
 * @param status Один из кодов статуса {@link INTERRUPT_CONTROLLER_EXIT_STATUSES} не включая `none`.
 * @param error  Ошибка соответствующая статусу. Для `abort|soft` это {@link AbortError}.
 */
type TAbortTimeoutControllerCallback = ((status: TInterruptControllerExitStatuses['timeout' | 'abort' | 'soft'], error: AbortError) => any)

/**
 * Вспомогательная обертка над пользовательским сигналом отмены запросов {@link AbortSignal} и/или прерывания по `timeout`.
 *
 * **Warning:** Функции обработчики вызываются до вызова `AbortController.abort(error)`, который может быть
 * установлен в `fetch(url, {signal:AbortTimeoutController.AbortController.signal})`. Это позволяет перехватить ошибку,
 * которая должна произойти через мгновение. Такая ошибка легко идентифицируется по сравнению ошибки вызова `fetch()`
 * с полем `AbortTimeoutController.error`.
 */
class AbortTimeoutController extends InterruptControllerLike {
  protected readonly _abortController = new AbortController()
  protected readonly _disableCustomSignal: null | (() => any) = null
  protected readonly _withoutError: boolean
  protected _callback!: TAbortTimeoutControllerCallback
  protected _alive = true
  protected _status: TInterruptControllerExitStatus = INTERRUPT_CONTROLLER_EXIT_STATUSES.none
  protected _tid: ReturnType<typeof setTimeout> = undefined as any
  protected _error: null | AbortError | TimeoutError = null

  protected _custom = (reason?: any) => {
    clearTimeout(this._tid)
    if (this._alive) {
      this._alive = false
      this._setAbortError(
        reason === ABORT_ONLY_BEFORE_RESPONSE
          ? INTERRUPT_CONTROLLER_EXIT_STATUSES.soft
          : INTERRUPT_CONTROLLER_EXIT_STATUSES.abort,
        reason)
    }
  }

  protected _timeout = () => {
    this._disableCustomSignal?.()
    if (this._alive) {
      this._alive = false
      this._setTimeoutError()
    }
  }

  /**
   * Конструктор должен вызываться с валидными параметрами и иметь хотя бы один `signal` или `timeout > 0`.
   *
   * **Warning:** Если `AbortSignal` уже в состоянии `aborted`, класс автоматически инициализируется с ошибкой, но не
   * вызывает `callback`. После инициализации проверьте `AbortTimeoutController.aborted`.
   *
   * @param callback Функция, которая будет вызвана с одним из статусов {@link TInterruptControllerExitStatus}, исключая `none` и соответствующей ошибкой.
   * @param signal   Пользовательский {@link AbortSignal}. Если его нет, обязателен параметр `timeout`.
   * @param timeout  Время истечения, после которого эмитируется ошибка со статусом {@link INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout}.
   * @param withoutError По умолчанию контроллер генерирует ошибку {@link AbortError} или {@link TimeoutError}.
   *                     Установите этот параметр в `true`, чтобы обработчик не генерировал ошибку и передал вторым параметром `null`.
   */
  constructor(callback: TAbortTimeoutControllerCallback, signal: AbortSignal, timeout: TPositiveNumber, withoutError?: undefined | null | boolean)
  constructor(callback: TAbortTimeoutControllerCallback, signal: AbortSignal, timeout: null, withoutError?: undefined | null | boolean)
  constructor(callback: TAbortTimeoutControllerCallback, signal: null, timeout: TPositiveNumber, withoutError?: undefined | null | boolean)
  constructor(callback: TAbortTimeoutControllerCallback, signal: null | AbortSignal, timeout: null | TPositiveNumber, withoutError?: undefined | null | boolean) {
    super()
    this._withoutError = !!withoutError
    let nonaborted = true
    if (signal) {
      if (signal.aborted) {
        nonaborted = false
        // Подменяем функцию, если уже нет никакого смысла
        this._callback = uselessFunctionStub_
        this._custom(signal.reason)
      }
      else {
        signal.addEventListener('abort', this._custom, { once: true })
        this._disableCustomSignal = (() => signal.removeEventListener('abort', this._custom))
      }
    }
    // Если функция не aborted привязываем пользовательский обработчик
    if (nonaborted) {
      this._callback = callback
      if (timeout) {
        this._tid = setTimeout(this._timeout, timeout)
      }
    }
  }

  get alive (): boolean {
    return this._alive
  }

  get signal (): AbortSignal {
    return this._abortController.signal
  }

  protected _setError (reason?: undefined | null | any): void {
    if (this._error) {
      return
    }
    switch (this._status) {
      case INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout:
        this._error = new TimeoutError(errorDetails.TimeoutError('Прервано по timeout.', reason))
        break
      case INTERRUPT_CONTROLLER_EXIT_STATUSES.abort:
        this._error = new TimeoutError(errorDetails.TimeoutError('Прервано пользователем.', reason))
        break
      case INTERRUPT_CONTROLLER_EXIT_STATUSES.soft:
        this._error = new TimeoutError(errorDetails.TimeoutError("Прервано пользователем с флагом 'ABORT_ONLY_BEFORE_RESPONSE'.", reason))
        break
      default:
        break
    }
  }

  /**
   * Гарантируется, если {@link status} не {@link TInterruptControllerExitStatuses.none}.
   */
  get error (): null | AbortError | TimeoutError {
    this._setError()
    return this._error
  }

  get status (): TInterruptControllerExitStatus {
    return this._status
  }

  protected _emitAbortOrTimeout (): void {
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback(this._status as TInterruptControllerExitStatuses['timeout' | 'soft' | 'abort'], this._error as TimeoutError)
    }
    else {
      SubscriberOptimizer.safe(this._callback, this._status as TInterruptControllerExitStatuses['timeout' | 'soft' | 'abort'], this._error as TimeoutError)
    }
    this._abortController.abort(this._error)
  }

  protected _setAbortError (status: TInterruptControllerExitStatuses['timeout' | 'soft' | 'abort'], reason?: undefined | null | any): void {
    this._status = status
    if (!this._withoutError) {
      this._setError(reason)
    }
    this._emitAbortOrTimeout()
  }

  protected _setTimeoutError (): void {
    this._status = INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout
    if (!this._withoutError) {
      this._setError()
    }
    this._emitAbortOrTimeout()
  }

  on (callback: TAbortTimeoutControllerCallback): void {
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback.on(callback)
    }
    else {
      this._callback = SubscriberOptimizer.wrap(this._callback, callback)
    }
  }

  off (callback: TAbortTimeoutControllerCallback): void {
    if (SubscriberOptimizer.instanceOf(this._callback)) {
      this._callback.off(callback)
    }
    else if (this._callback === callback) {
      this._callback = uselessFunctionStub_
    }
  }

  /**
   * Деактивирует событие `timeout`.
   *
   * Эта функция может использоваться, после получения результата от сервера до или во время постобработки, когда
   * прерывание нежелательно.
   */
  disableTimeout (): void {
    clearTimeout(this._tid)
  }

  disable (): void {
    this._alive = false
    this._disableCustomSignal?.()
    clearTimeout(this._tid)
  }
}

/**
 * Расширяет {@link AbortController} методом `abortOnlyBeforeResponse()` с автоматической передачей флага {@link ABORT_ONLY_BEFORE_RESPONSE}
 * как причины отмены для контролируемого прерывания только на стадии до получения ответа от сервера.
 */
class AbortOnlyBeforeResponseController extends AbortController {
  abortOnlyBeforeResponse (): void {
    this.abort(ABORT_ONLY_BEFORE_RESPONSE)
  }
}

export {
  ABORT_ONLY_BEFORE_RESPONSE,
  type TTimeoutControllerCallback,
  TimeoutController,
  type TAbortTimeoutControllerCallback,
  AbortTimeoutController,
  AbortOnlyBeforeResponseController
}
