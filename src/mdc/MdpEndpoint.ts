import { type JsonLike, type TNonemptyString, type TPositiveInteger, type TResponse, uselessFunctionStub_ } from '../types.js'
import { errorDetails, MethodAccessError } from '../errors.js'
import type {
  TMdpAnnounceOptions,
  TMdpDecodedResponse,
  TMdpDecodedService,
  TMdpMessageOptions,
  TMdpRequestOptions
} from '../mdp/types.js'
import {
  type TMdpEndpointEventCodes,
  type TMdpEndpointReadonlyOptions,
  type MdpEndpointResponseContextLike,
  type MdpEndpointAckContextLike,
  type TMdpEndpointHandler,
  type TMdpTimeoutOptions,
  MDP_ENDPOINT_CONTEXT_STATUS_CODES,
  MDP_ENDPOINT_EVENT_CODES
} from './types.js'
import {
  type IMdpEndpointInternalContext,
  type TRequestContextKind_,
  I_ENDPOINT_HANDLER_,
  I_ENDPOINTS_,
  I_INCOMING_,
  I_MESSAGE_CONTEXT_,
  I_MESSAGE_LITE_,
  I_OUTGOING_,
  I_RESPONSE_CONTEXT_,
  mdpEndpointCreateErrorContext
} from './contexts.js'
import type { MdpEndpointDispatcher } from './MdpEndpointDispatcher.js'

/**
 * Клиент с резервированным каналом для смешанных сообщений и запросов протокола `MFP`.
 */
class MdpEndpoint {
  private readonly _dispatcher: MdpEndpointDispatcher
  private readonly _endpoint: TNonemptyString
  private readonly _options: TMdpEndpointReadonlyOptions
  protected _handler: TMdpEndpointHandler<any>
  private _alive = true
  private _enabled = true

  constructor(connection: MdpEndpointDispatcher, endpoint: TNonemptyString, options: TMdpEndpointReadonlyOptions, handler?: undefined | null | TMdpEndpointHandler<any>) {
    this._dispatcher = connection
    this._endpoint = endpoint
    this._options = options
    this._handler = handler ?? uselessFunctionStub_
  }

  /**
   * Имя `endpoint` для которого создано соединение.
   */
  get endpoint (): TNonemptyString {
    return this._endpoint
  }

  get options (): TMdpEndpointReadonlyOptions {
    return this._options
  }

  get alive (): boolean {
    return this._alive
  }

  get enabled (): boolean {
    return this._enabled
  }

  get dispatcher (): MdpEndpointDispatcher {
    return this._dispatcher
  }

  private _safeHandlerQueue = Promise.resolve()
  protected async [I_ENDPOINT_HANDLER_] (type: TMdpEndpointEventCodes['message' | 'request' | 'binary' | 'open' | 'close' | 'error' | 'enable'], value: any): Promise<void> {
    const previous = this._safeHandlerQueue
    let finalize!: (() => any)
    this._safeHandlerQueue = new Promise((resolve) => finalize = resolve)
    await previous
    try {
      this._handler(type, value)
    } catch (e) {
      console.error(e)
    } finally {
      finalize()
    }
  }

  private _messageErrorContextIfError<T extends TRequestContextKind_> (kind: T): null | ((T extends 1 ? MdpEndpointResponseContextLike<any> : MdpEndpointAckContextLike) & IMdpEndpointInternalContext<any>) {
    if (!this._enabled || !this._alive) {
      return mdpEndpointCreateErrorContext(
        kind, this._dispatcher.framer.nextId(), this._endpoint, MDP_ENDPOINT_CONTEXT_STATUS_CODES.logic,
        new MethodAccessError(errorDetails.MethodAccessError(`MdpEndpoint endpoint:'${this._endpoint}' находится в состоянии 'enabled:false'.`))
      )
    }
    return null
  }

  messageContext (options: TMdpMessageOptions<any> & TMdpTimeoutOptions): MdpEndpointAckContextLike {
    const ctx = this._messageErrorContextIfError(0)
    return ctx ?? this._dispatcher[I_MESSAGE_CONTEXT_](this._endpoint, this._options, options, false, false)
  }

  message (options: TMdpMessageOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedService>> {
    const ctx = this._messageErrorContextIfError(0)
    return ctx
      // @ts-expect-error
      ? Promise.resolve(ctx)
      : this._dispatcher[I_MESSAGE_CONTEXT_](this._endpoint, this._options, options, false, false)._getResultAsync()
  }

  messageLite (options: Omit<TMdpMessageOptions<any>, 'needAck'>): null | TPositiveInteger {
    return (this._enabled && this._alive)
      ? this._dispatcher[I_MESSAGE_LITE_](this._endpoint, this._options, options, false, false)
      : null
  }

  announceContext (options: TMdpAnnounceOptions<any> & TMdpTimeoutOptions): MdpEndpointAckContextLike {
    const ctx = this._messageErrorContextIfError(0)
    return ctx ?? this._dispatcher[I_MESSAGE_CONTEXT_](this._endpoint, this._options, options, true, false)
  }

  announce (options: TMdpAnnounceOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedService>> {
    const ctx = this._messageErrorContextIfError(0)
    return ctx
      // @ts-expect-error
      ? Promise.resolve(ctx)
      : this._dispatcher[I_MESSAGE_CONTEXT_](this._endpoint, this._options, options, true, false)._getResultAsync()
  }

  announceLite (options: Omit<TMdpAnnounceOptions<any>, 'needAck'>): null | TPositiveInteger {
    return (this._enabled && this._alive)
      ? this._dispatcher[I_MESSAGE_LITE_](this._endpoint, this._options, options, true, false)
      : null
  }

  requestContext<T extends JsonLike> (options: TMdpRequestOptions<any> & TMdpTimeoutOptions): MdpEndpointResponseContextLike<T> {
    const ctx = this._messageErrorContextIfError(1)
    return ctx ?? this._dispatcher[I_RESPONSE_CONTEXT_](this._endpoint, this._options, options, false, false)
  }

  request<T extends JsonLike> (options: TMdpRequestOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedResponse<T>>> {
    const ctx = this._messageErrorContextIfError(1)
    return ctx
      // @ts-expect-error
      ? Promise.resolve(ctx)
      : this._dispatcher[I_RESPONSE_CONTEXT_](this._endpoint, this._options, options, true, false)._getResultAsync()
  }

  /**
   * Изменить обработчика сообщений и запросов.
   *
   * @param handler Обработчик принимающий параметром сообщение, контекст для возврата ответа на запрос или ошибки и состояние подключения.
   */
  changeHandler (handler: TMdpEndpointHandler<any>): void {
    if (this._alive) {
      this._handler = handler
    }
  }

  private _abortAllPending (): void {
    for (const item of this._dispatcher[I_OUTGOING_].values()) {
      if (item.endpoint === this.endpoint) {
        item.abort()
      }
    }
    for (const item of this._dispatcher[I_INCOMING_].values()) {
      if (item.endpoint === this.endpoint) {
        item.abort()
      }
    }
  }

  /**
   * Временно отменить подписку или подключиться заново.
   *
   * **Note:** `MdpEndpoint` резервирует {@link name} только для одного клиента. Отписка предполагает что сообщения
   * для текущего канала будут перенаправляться в глобальный обработчик сообщения и ошибок.
   *
   * @param enable Подписаться или отписаться.
   */
  enable (enable: boolean): void {
    if (this._alive && this._dispatcher[I_ENDPOINTS_].has(this._endpoint) && this._enabled !== !!enable) {
      this._enabled = !!enable
      if (!this._enabled) {
        this._abortAllPending()
      }
      this._handler(MDP_ENDPOINT_EVENT_CODES.enable, this._enabled)
    }
  }

  /**
   * Освобождает `endpoint` и вызывает `abort` для ожидающих сообщений(если они есть).
   */
  close (): void {
    if (this._alive) {
      const opened = this._enabled
      this._alive = false
      this._enabled = false
      this._dispatcher[I_ENDPOINTS_].delete(this._endpoint)
      this._abortAllPending()
      if (opened) {
        this._handler(MDP_ENDPOINT_EVENT_CODES.close, null)
      }
    }
  }
}

export {
  MdpEndpoint
}
