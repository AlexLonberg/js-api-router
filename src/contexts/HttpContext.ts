import { type AbortError, type TimeoutError, errorDetails, ApiRouterError, InterruptError, SendError } from '../errors.js'
import type { TResponse, TPositiveNumber, TNonNegInteger } from '../types.js'
import { type TInterruptControllerExitStatuses, INTERRUPT_CONTROLLER_EXIT_STATUSES } from '../interfaces/InterruptControllerLike.js'
import { type TRequestStage, type TRequestStatus, PASSTHROUGH_MARKER, REQUEST_STAGES, REQUEST_STATUSES } from '../interfaces/ContextLike.js'
import type { MiddlewareLike } from '../interfaces/MiddlewareLike.js'
import { type AsyncQueue, MAX_QUEUE_PRIORITY } from '../libs/AsyncQueue.js'
import { AbortTimeoutController } from '../libs/AbortTimeoutController.js'
import { type TUrlComponents, type MutableUrl, useUrlComponents } from '../configs/UrlConfig.js'
import type { EndpointHttpConfig } from '../configs/EndpointHttpConfig.js'
import type { THttpRequestMethod } from '../configs/types.js'
import type { MutableHeaders } from '../configs/HeadersConfig.js'
import { MutableRequestInit } from '../configs/RequestInitConfig.js'
import type { TMiddlewareRef } from '../middlewares/Middleware.js'
import { type THttpContextOptions, HttpContextLike } from './Context.js'

class HttpContext<TIn, TOut> extends HttpContextLike<TOut> {
  static get kind (): 'http' { return 'http' }
  get kind (): 'http' { return 'http' }

  protected readonly _config: EndpointHttpConfig<TOut>
  protected readonly _method: THttpRequestMethod
  protected readonly _options: undefined | null | Record<string, any>
  protected readonly _requestId: undefined | null | number | symbol | string
  protected readonly _path: undefined | null | string | TUrlComponents
  protected readonly _inputValue: null | TIn
  protected readonly _abortSignal: null | AbortSignal
  protected _stage: TRequestStage = REQUEST_STAGES.none
  protected _status: TRequestStatus = REQUEST_STATUSES.none
  // Временные переменные запроса
  protected _attempt = 0
  protected _currentValue: any = null
  protected _result: null | TResponse<TOut> = null
  protected _resultPromise: null | { promise: Promise<any>, resolve: ((_: TResponse<TOut>) => any) } = null
  // Устанавливаются на старте перед middleware
  protected _abortControl: null | AbortTimeoutController = null
  protected _retryId: ReturnType<typeof setTimeout> = undefined as any
  protected _url: null | MutableUrl = null
  protected _requestInit: null | MutableRequestInit = null
  protected _headers: null | MutableHeaders = null

  /**
   * Создает контекс для обслуживания одного `http` запроса.
   *
   * @param config  Конфигурация `Endpoint`.
   * @param options Пользовательские опции.
   */
  constructor(
    config: EndpointHttpConfig<TOut>,
    options: THttpContextOptions
  ) {
    super()
    this._config = config
    this._method = options.method
    this._options = options.options
    this._requestId = options.requestId
    this._path = options.path
    this._inputValue = options.data ?? null
    this._abortSignal = options.abortSignal ?? null
  }

  get config (): EndpointHttpConfig<TOut> {
    return this._config
  }

  get method (): THttpRequestMethod {
    return this._method
  }

  get options (): null | Record<string, any> {
    return this._options ?? null
  }

  get requestId (): null | number | symbol | string {
    return this._requestId ?? null
  }

  get stage (): TRequestStage {
    return this._stage
  }

  get status (): TRequestStatus {
    return this._status
  }

  get url (): MutableUrl {
    return this._url ?? (this._url = this._config.url.toMutable())
  }

  get requestInit (): MutableRequestInit {
    return this._requestInit ?? (this._requestInit = new MutableRequestInit(this._config.requestInit.requestInitBase, this._method, this.headers))
  }

  get headers (): MutableHeaders {
    return this._headers ?? (this._headers = this._config.headers.toMutable())
  }

  get abortSignal (): null | AbortSignal {
    return this._abortControl?.signal ?? null
  }

  // NOTE Не отразит реальный результат после запрета и установки Number.MAX_SAFE_INTEGER
  // get attempt (): number {
  //   return this._attempt
  // }

  passthrough (): any {
    return PASSTHROUGH_MARKER
  }

  isCancelled (): boolean {
    return this._stage === REQUEST_STAGES.finished
  }

  /**
   * Резолвит результат, если еще не установлен `stage:'finished'`.
   */
  protected async _handleResult (status: TRequestStatus, result: TResponse<TOut>): Promise<void> {
    if (this._stage !== REQUEST_STAGES.finished) {
      this._stage = REQUEST_STAGES.finished
      this._status = status
      this._result = result
      this._abortControl?.disable()
      // Эта функция вызывается синхронно и мы должны разорвать стек вызовов
      await Promise.resolve()
      // Прежде всего освободим очередь
      if (this._resultPromise) {
        this._resultPromise.resolve(result)
      }
      if (this._config.handler) {
        this._config.handler(result.ok, result.value, result.error, this._requestId)
      }
    }
  }

  protected _retry (): void {
    // Этап _stage проверяется в _execute() и здесь это делать необязательно.
    // Если задача выполняется без очередности, то в AsyncQueue она уже завершена
    if (this._config.queue && this._config.queueUnordered) {
      this._config.queue.add(() => this._execute(), MAX_QUEUE_PRIORITY, this._abortControl?.signal)
    }
    // ... иначе продолжаем выполнение - очередь ждет разрешения Promise или ее вообще нет
    else {
      this._execute()
    }
  }

  protected _handleError (error: any, type: 0 | 1 | 2): void {
    clearTimeout(this._retryId)
    // Установка _status подразумевает вызов _handleResult() и все дальнейшие действия должны быть проигнорированы
    if (this._status !== REQUEST_STATUSES.none) {
      return
    }
    // Прерывание может быть инициировано пользовательским AbortSignal, по timeout или самостоятельно сгенерированной ошибке AbortError.
    // На стадии 'pending' в 'cache ()' упадет ошибка AbortError/TimeoutError, которая может быть уже обработана, если инициализирован AbortTimeoutController.
    if (error instanceof InterruptError) {
      if (this._abortControl?.error === error) {
        // ... ничего не делаем, этот callback уже обработан
      }
      else {
        this._abortControl?.disable()
        this._handleAbortError(INTERRUPT_CONTROLLER_EXIT_STATUSES.abort, error)
      }
    }
    // Если это вызов fetch()(type === 0) и разрешены повторы, не прерываем запрос
    else if (type === 0 && this._stage !== REQUEST_STAGES.finished && this._config.retries && this._config.retries > this._attempt) {
      this._stage = REQUEST_STAGES.started
      const delay = this._config.retryDelay?.(this._attempt) ?? 0
      this._retryId = setTimeout(() => this._retry(), delay)
    }
    else {
      const e = (error instanceof ApiRouterError)
        ? error
        : new SendError(errorDetails.SendError('HttpContext. Ошибка выполнения запроса.', error))
      e.detail.url = this.url.toString()
      this._handleResult(REQUEST_STATUSES.error, { ok: false, value: null, error: e })
    }
  }

  /**
   * Возвратит результат наличия ошибки, то есть `true` - это ошибка.
   */
  protected async _processMiddleware (mw: MiddlewareLike<any, any>, type: 0 | 1 | 2): Promise<boolean> {
    try {
      const v = await mw.process(this, this._currentValue)
      if (v !== PASSTHROUGH_MARKER) {
        this._currentValue = v
      }
      return false
    } catch (e) {
      this._handleError(e, type)
    }
    return true
  }

  protected async _runMiddleware (mw: TMiddlewareRef<any, any>, type: 1 | 2): Promise<boolean> {
    if (mw.iterable) {
      for (const item of mw.ref) {
        if (await this._processMiddleware(item, type)) {
          return true
        }
      }
      return false
    }
    return this._processMiddleware(mw.ref, type)
  }

  /**
   * Эту функцию могут вызывать только {@link run()} или {@link _retry()}, при этом второй должен переустановить `_stage:'started'`
   */
  protected async _execute (): Promise<void> {
    if (this._stage !== REQUEST_STAGES.started || this._status !== REQUEST_STATUSES.none) {
      return
    }
    this._stage = REQUEST_STAGES.preprocessing
    // Сбросим, возможно это был _retry() и middleware должны обработать параметры с самого начала.
    if (this._attempt) {
      this._headers = null
      this._requestInit = null
      this._url = null
    }
    this._attempt++

    // Для запросов GET этот параметр игнорируется, но может использоваться в middleware
    this._currentValue = this._inputValue
    if (this._config.preprocessor) {
      if (await this._runMiddleware(this._config.preprocessor, 1)) {
        // ошибки перенаправляются из _processMiddleware(), и здесь мы просто должны выйти
        return
      }
    }

    // Установим компоненты пути, signal и разблокируем доступ к заголовкам
    if (this._path) {
      useUrlComponents(this.url, this._path)
    }
    const requestInit = this.requestInit
    if (this._abortControl) {
      requestInit._setAbortSignal(this._abortControl.signal)
    }

    this._stage = REQUEST_STAGES.pending
    if (await this._processMiddleware(this._config.executor.ref, 0)) {
      // Повторные попытки допускаются только при сетевых ошибках - ошибки клиентских middleware игнорируются
      // Ошибка с параметром type:0 проверит - можно ли повторить запрос
      return
    }
    // После получения результата отключаем прерывание по timeout
    this._abortControl?.disableTimeout()

    this._stage = REQUEST_STAGES.postprocessing
    if (this._config.postprocessor) {
      if (await this._runMiddleware(this._config.postprocessor, 2)) {
        return
      }
    }

    this._handleResult(REQUEST_STATUSES.ok, { ok: true, value: this._currentValue, error: null })
  }

  protected _handleAbortError (status: TInterruptControllerExitStatuses['timeout' | 'soft' | 'abort'], error: AbortError | TimeoutError): void {
    // Запрещаем любые повторные попытки
    this._attempt = Number.MAX_SAFE_INTEGER
    clearTimeout(this._retryId)
    // Пользовательски `abort` - прерывает любой запрос, иначе запрос прерывается на стадиях до fetch() включительно.
    // Если запрос уже обрабатывается на клиенте(stage >= 4) - игнорируем прерывание и дожидаемся постобработки.
    if (this._status === REQUEST_STATUSES.none && (status === INTERRUPT_CONTROLLER_EXIT_STATUSES.abort || this._stage < REQUEST_STAGES.postprocessing)) {
      error.detail.url = this.url.toString()
      this._handleResult(status === INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout ? REQUEST_STATUSES.timeout : REQUEST_STATUSES.aborted, { ok: false, value: null, error })
    }
  }

  /**
   * !!! Эта функция может быть вызвана один раз из {@link run()}.
   *
   * Возвратит `true` если время запроса уже истекло и установит `status:'aborted'`.
   * {@link _handleResult()} вызывается автоматически.
   */
  protected _initAbortSignal (abortSignal: null | AbortSignal, timeout: null | TPositiveNumber): boolean {
    this._abortControl = new AbortTimeoutController((status: TInterruptControllerExitStatuses['timeout' | 'soft' | 'abort'], error: AbortError | TimeoutError) => this._handleAbortError(status, error), abortSignal!, timeout!)
    if (this._abortControl.status) {
      this._handleAbortError(this._abortControl.status, this._abortControl.error!)
      return true
    }
    return false
  }

  /**
   * !!! Должна вызываться только из {@link _getResultPromise()}
   */
  protected _createResultPromise (): Promise<TResponse<TOut>> {
    let resolve!: ((_: TResponse<TOut>) => any)
    const promise = new Promise<TResponse<TOut>>((ok) => {
      resolve = ok
    })
    this._resultPromise = { promise, resolve }
    return promise
  }

  protected _getResultPromise (): Promise<TResponse<TOut>> {
    return this._resultPromise?.promise ?? this._createResultPromise()
  }

  protected _addToQueue (queue: AsyncQueue): void {
    // Для очереди выясняем: нужна ли нам очередность?
    const task = this._config.queueUnordered
      ? (() => this._execute())
      : (() => {
        this._execute()
        // Очередь будет ждать полного разрешения результата, даже если this._execute() придется вызывать несколько раз
        return this._getResultPromise()
      })
    queue.add(task, this._config.queuePriority ?? 0 as TNonNegInteger, this._abortControl?.signal)
  }

  async run (): Promise<void> {
    if (this._stage === REQUEST_STAGES.none) {
      this._stage = REQUEST_STAGES.started
      await Promise.resolve()
      if ((this._abortSignal || this._config.timeout) && this._initAbortSignal(this._abortSignal, this._config.timeout)) {
        // _initAbortSignal() сама вызовет пользовательский обработчик
      }
      else if (this._config.queue) {
        this._addToQueue(this._config.queue)
      }
      else {
        this._execute()
      }
    }
  }

  result (): TResponse<TOut> | Promise<TResponse<TOut>> {
    this.run()
    return (this._stage === REQUEST_STAGES.finished) ? this._result! : this._getResultPromise()
  }
}

export {
  HttpContext
}
