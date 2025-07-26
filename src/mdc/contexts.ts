import { interfaceMarker } from 'ts-interface-core'
import type { TNonemptyString, TPositiveInteger, TPositiveNumber, TResponse } from '../types.js'
import { errorDetails, ApiRouterError, SendError, PackError, AbortError, TimeoutError, LogicError } from '../errors.js'
import {
  type InterruptControllerLike,
  type TInterruptControllerExitStatuses,
  INTERRUPT_CONTROLLER_EXIT_STATUSES
} from '../interfaces/InterruptControllerLike.js'
import { AbortTimeoutController, TimeoutController } from '../libs/AbortTimeoutController.js'
import type {
  TMdpAnnounceOptions,
  TMdpBinaryOptions,
  TMdpDecodedBinary,
  TMdpDecodedRequest,
  TMdpDecodedResponse,
  TMdpDecodedService,
  TMdpMessageOptions,
  TMdpRequestOptions,
  TMdpResponseOptions
} from '../mdp/types.js'
import { MFP_FRAME_TYPES } from '../mfp/types.js'
import {
  type TMdpEndpointConextStatusCodes,
  type TMdpEndpointConextStatusCode,
  type TMdpEndpointReadonlyOptions,
  type TMdpTimeoutOptions,
  MDP_ENDPOINT_CONTEXT_STATUS_CODES,
  MdpEndpointContextLike,
  MdpEndpointAckContextLike,
  MdpEndpointRequestContextLike,
  MdpEndpointResponseContextLike,
} from './types.js'
import type { MdpEndpointDispatcher } from './MdpEndpointDispatcher.js'

const CTX_LIKE_ = interfaceMarker(MdpEndpointContextLike)!
const CTX_ACK_ = interfaceMarker(MdpEndpointAckContextLike)!
const CTX_REQUEST_ = interfaceMarker(MdpEndpointRequestContextLike)!
const CTX_RESPONSE_ = interfaceMarker(MdpEndpointResponseContextLike)!

const I_ENDPOINTS_ = Symbol()
const I_OUTGOING_ = Symbol()
const I_INCOMING_ = Symbol()
const I_MESSAGE_CONTEXT_ = Symbol()
const I_MESSAGE_LITE_ = Symbol()
const I_RESPONSE_CONTEXT_ = Symbol()
const I_BINARY_CONTEXT_ = Symbol()
const I_BINARY_LITE_ = Symbol()
const I_PING_CONTEXT_ = Symbol()
const I_TIMEOUT_OR_ABORT_ = Symbol()
const I_ENDPOINT_HANDLER_ = Symbol()

const MDP_ENDPOINT_DISPATCHER_INTERNAL = Object.freeze({
  // MdpEndpointDispatcher
  endpoints: I_ENDPOINTS_ as typeof I_ENDPOINTS_,
  outgoing: I_OUTGOING_ as typeof I_OUTGOING_,
  incoming: I_INCOMING_ as typeof I_INCOMING_,
  messageContext: I_MESSAGE_CONTEXT_ as typeof I_MESSAGE_CONTEXT_,
  messageLite: I_MESSAGE_LITE_ as typeof I_MESSAGE_LITE_,
  responseContext: I_RESPONSE_CONTEXT_ as typeof I_RESPONSE_CONTEXT_,
  binaryContext: I_BINARY_CONTEXT_ as typeof I_BINARY_CONTEXT_,
  binaryLite: I_BINARY_LITE_ as typeof I_BINARY_LITE_,
  pingContext: I_PING_CONTEXT_ as typeof I_PING_CONTEXT_,
  timeoutOrAbort: I_TIMEOUT_OR_ABORT_ as typeof I_TIMEOUT_OR_ABORT_,
  // MdpEndpoint
  endpointHandler: I_ENDPOINT_HANDLER_ as typeof I_ENDPOINT_HANDLER_,
} as const)

/**
 * 0 - ack, 1 - response
 */
type TRequestContextKind_ = 0 | 1
type TRequestErrorStatus_ = TMdpEndpointConextStatusCodes['pack' | 'error' | 'logic']
type TCtxInterruptCode_ = TMdpEndpointConextStatusCodes['timeout' | 'abort']
type TInterruptStatus_ = TInterruptControllerExitStatuses['timeout' | 'abort' | 'soft']

/**
 * Внутренний интерфейс контекстов
 */
interface IMdpEndpointInternalContext<T> {
  /**
   * Обновление входящих данных `ack` и результата на `request`.
   *
   * Диспетчер не определяет тип сообщения и передает в любой контекст связанное сообщение по `refId`. Контекст сам
   * должен сгенерировать правильную ошибку и удалить себя из {@link I_OUTGOING_} или {@link I_INCOMING_}.
   */
  _update (message: TMdpDecodedService | TMdpDecodedBinary | TMdpDecodedResponse): void
  /**
   * Возвращает результат обернутый в Promise.
   */
  _getResultAsync (): Promise<TResponse<T>>
}

interface _IMdpEndpointContext<T> extends IMdpEndpointInternalContext<T> {
  ok: boolean
  value: null | T
  error: null | ApiRouterError
  result (): TResponse<T> | Promise<TResponse<T>>
  _status: TMdpEndpointConextStatusCode
  /**
   * Будет инициализирован если есть timeout or abortSignal
   */
  _controller?: InterruptControllerLike
  /**
   * Для ожиданий, `ack` всегда инициализируется Promise или false(если AbortSignal.aborted).
   * Для контекста Response может быть сразу инициализирован true, если не был установлен `needAck`.
   */
  _promiseAck: null | boolean | Promise<boolean>
  _promiseAckResolve?: null | ((value: boolean) => any)
  _promiseResult: null | TResponse<T> | Promise<TResponse<T>>
  _promiseResultResolve?: null | ((value: TResponse<T>) => any)
  _resolveAck?: (value: boolean) => any
  _resolveResult?: (value: TResponse<T>) => any
}

function _ensureRequestError (code: TRequestErrorStatus_, e: any): ApiRouterError {
  if (e instanceof ApiRouterError) {
    return e
  }
  if (code === MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack) {
    return new PackError(errorDetails.PackError('В результате запроса произошла ошибка упаковки сообщения.', e))
  }
  return new SendError(errorDetails.SendError('В результате запроса произошла ошибка. Возможно соединение недоступно и требует ожидания и/или переподключения.', e))
}

function normalizeMessage_ (
  defaultOptions: TMdpEndpointReadonlyOptions,
  requestOptions: TMdpMessageOptions<any> & TMdpAnnounceOptions<any>,
  announceFileSet: boolean
) {
  const msg: TMdpMessageOptions<any> & TMdpAnnounceOptions<any> = {
    data: requestOptions.data,
    error: requestOptions.error,
    needAck: requestOptions.needAck ?? defaultOptions.needAck,
    checksum: requestOptions.checksum ?? defaultOptions.checksum
  }
  if (announceFileSet) {
    msg.expected = requestOptions.expected
  }
  else {
    msg.files = requestOptions.files
  }
  return msg
}

function normalizeRequest_ (
  defaultOptions: TMdpEndpointReadonlyOptions,
  requestOptions: TMdpRequestOptions<any>
) {
  const msg: TMdpRequestOptions<any> = {
    data: requestOptions.data,
    files: requestOptions.files,
    needAck: requestOptions.needAck ?? defaultOptions.needAck,
    checksum: requestOptions.checksum ?? defaultOptions.checksum
  }
  return msg
}

function normalizeBinary_ (
  defaultOptions: TMdpEndpointReadonlyOptions,
  requestOptions: TMdpBinaryOptions
) {
  return {
    refId: requestOptions.refId,
    hasExpected: requestOptions.hasExpected,
    hasStreaming: requestOptions.hasStreaming,
    hasData: requestOptions.hasData,
    key: requestOptions.key,
    bin: requestOptions.bin,
    final: requestOptions.final,
    needAck: requestOptions.needAck ?? defaultOptions.needAck,
    checksum: requestOptions.checksum ?? defaultOptions.checksum
  }
}

function _useAbortTimeoutController (ctx: MdpEndpointContextLike<any> & _IMdpEndpointContext<any>, abortSignal: undefined | null | AbortSignal, timeout: number) {
  if (abortSignal) {
    ctx._controller = new AbortTimeoutController(
      (type: TInterruptStatus_, _: any) => {
        if (type === INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout) {
          ctx.timeout()
        }
        else {
          ctx.abort()
        }
      },
      abortSignal,
      timeout as TPositiveNumber,
      true
    )
  }
  else {
    ctx._controller = new TimeoutController(
      (_: any, __: any) => ctx.timeout(),
      timeout as TPositiveNumber,
      true
    )
  }
}

/**
 * Используется для внутренних прерываний по `abort/timeout` или связанными с ними явными вызовами `abort()/timeout()`.
 */
function _handleAbortOrTimeout (
  dispatcher: MdpEndpointDispatcher,
  ctx: MdpEndpointContextLike<any> & _IMdpEndpointContext<any>,
  code: TCtxInterruptCode_,
  value: null | TMdpDecodedService,
  sendSignal: boolean
) {
  ctx._controller?.disable()
  dispatcher[I_OUTGOING_].delete(ctx.id)
  if (ctx.isFinished()) {
    return
  }
  ctx._status = code
  ctx.ok = false
  ctx.value = value
  if (code === MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort) {
    ctx.error = new AbortError(errorDetails.AbortError(`Прерывание 'abort' endpoint:${ctx.endpoint}(id:${ctx.id}).`))
  }
  else {
    ctx.error = new TimeoutError(errorDetails.TimeoutError(`Прерывание 'timeout' endpoint:${ctx.endpoint}(id:${ctx.id}).`))
  }
  if (sendSignal) {
    dispatcher[I_TIMEOUT_OR_ABORT_](ctx.id, true, code)
  }
  ctx._resolveAck?.(false)
  ctx._resolveResult?.(ctx as TResponse<any>)
}

function _handleResponseError (
  dispatcher: MdpEndpointDispatcher,
  ctx: MdpEndpointContextLike<TMdpDecodedService> & _IMdpEndpointContext<TMdpDecodedService>,
  message: TMdpDecodedService | TMdpDecodedBinary | TMdpDecodedResponse,
  prefix: string
) {
  if (message.type === MFP_FRAME_TYPES.service && (message.abort || message.timeout)) {
    _handleAbortOrTimeout(
      dispatcher,
      ctx,
      message.abort ? MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort : MDP_ENDPOINT_CONTEXT_STATUS_CODES.timeout,
      message,
      false
    )
  }
  else {
    ctx._status = MDP_ENDPOINT_CONTEXT_STATUS_CODES.logic
    ctx.ok = false
    ctx.value = null
    const code = message.type === MFP_FRAME_TYPES.service ? `, code:${message.code}` : ''
    ctx.error = new LogicError(errorDetails.LogicError(
      `${prefix}, получено type:${message.type}, id:${message.id}, refId:${message.refId}${code}.`
    ))
    ctx._resolveAck?.(false)
    ctx._resolveResult?.(ctx as TResponse<any>)
  }
}

/**
 * Создает контекст с ошибкой. Применяется когда упаковка или отправка запроса завешились ошибкой и создавать
 * полноценный контекст не имеет смысла.
 */
function mdpEndpointCreateErrorContext<T extends TRequestContextKind_> (
  kind: T,
  id: TPositiveInteger,
  endpoint: TNonemptyString,
  status: TRequestErrorStatus_,
  e: any
): (T extends 1 ? MdpEndpointResponseContextLike<any> : MdpEndpointAckContextLike) & IMdpEndpointInternalContext<any> {
  const ctx = {
    [CTX_LIKE_]: null,
    id,
    endpoint,
    status,
    ok: false,
    value: null,
    error: _ensureRequestError(status, e),
    isFinished () { return true },
    abort () { /**/ },
    timeout () { /**/ },
    ack () { return false },
    _update (_: any) { /**/ },
    async _getResultAsync () {
      await Promise.resolve()
      return ctx
    }
  }
  if (kind === 1) {
    ctx[CTX_RESPONSE_] = null
    // @ts-expect-error
    ctx.result = () => ctx
  }
  else {
    ctx[CTX_ACK_] = null
  }
  // @ts-expect-error
  return ctx
}

/**
 * Создает исходящий контекст-заглушку сообщений без опции `needAck`, для которых `ack` всегда разрешается `true`.
 */
function mdpEndpointCreateAckContextOk (
  id: TPositiveInteger,
  endpoint: TNonemptyString,
  value: TMdpDecodedService
): MdpEndpointAckContextLike & IMdpEndpointInternalContext<any> {
  const ctx = {
    [CTX_LIKE_]: null,
    [CTX_ACK_]: null,
    id,
    endpoint,
    status: MDP_ENDPOINT_CONTEXT_STATUS_CODES.complete,
    ok: true,
    value,
    error: null,
    isFinished () { return true },
    abort () { /**/ },
    timeout () { /**/ },
    ack () { return true },
    _update (_: any) { /**/ },
    async _getResultAsync () {
      await Promise.resolve()
      return ctx as TResponse<TMdpDecodedService>
    }
  }
  return ctx
}

/**
 * Создает контекст для сообщений ожидающих только подтверждения `needAck`: ping/message/binary.
 */
function mdpEndpointCreateAckContext (
  dispatcher: MdpEndpointDispatcher,
  id: TPositiveInteger,
  endpoint: TNonemptyString,
  timeout: number,
  abortSignal: undefined | null | AbortSignal,
  sendSignal: boolean
): MdpEndpointAckContextLike & IMdpEndpointInternalContext<TMdpDecodedService> {
  const ctx: MdpEndpointAckContextLike & _IMdpEndpointContext<TMdpDecodedService> = {
    [CTX_LIKE_]: null,
    [CTX_ACK_]: null,
    get id () {
      return id
    },
    endpoint,
    _status: MDP_ENDPOINT_CONTEXT_STATUS_CODES.none,
    get status () {
      return ctx._status
    },
    ok: false,
    value: null, // TMdpDecodedService
    error: null,
    isFinished () { return ctx._status !== MDP_ENDPOINT_CONTEXT_STATUS_CODES.none },
    abort () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort, null, sendSignal)
    },
    timeout () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.timeout, null, sendSignal)
    },
    _promiseAck: null,
    _resolveAck (value: boolean) {
      const resolve = ctx._promiseAckResolve
      ctx._promiseAckResolve = null
      if (resolve) {
        ctx._promiseAck = value
        resolve(value)
      }
      else if (ctx._promiseAck === null) {
        ctx._promiseAck = value
      }
    },
    ack () {
      if (ctx._promiseAck === null) {
        ctx._promiseAck = new Promise<boolean>((resolve) => ctx._promiseAckResolve = resolve)
      }
      return ctx._promiseAck
    },
    _promiseResult: null,
    _resolveResult (value: TResponse<TMdpDecodedService>) {
      const resolve = ctx._promiseResultResolve
      ctx._promiseResultResolve = null
      if (resolve) {
        ctx._promiseResult = value
        resolve(value)
      }
      else if (ctx._promiseResult === null) {
        ctx._promiseResult = value
      }
    },
    result (): TResponse<TMdpDecodedService> | Promise<TResponse<TMdpDecodedService>> {
      if (ctx._promiseResult === null) {
        ctx._promiseResult = new Promise((resolve) => ctx._promiseResultResolve = resolve)
      }
      return ctx._promiseResult
    },
    async _getResultAsync () {
      await Promise.resolve()
      return ctx.result()
    },
    _update (message: TMdpDecodedService | TMdpDecodedBinary | TMdpDecodedResponse) {
      ctx._controller?.disable()
      dispatcher[I_OUTGOING_].delete(id)
      if (ctx.isFinished()) {
        return
      }
      if (message.type === MFP_FRAME_TYPES.service && message.ack && message.refId === id) {
        ctx._status = MDP_ENDPOINT_CONTEXT_STATUS_CODES.complete
        ctx.ok = true
        ctx.value = message
        ctx._resolveAck?.(true)
        ctx._resolveResult?.(ctx as TResponse<TMdpDecodedService>)
      }
      else {
        // Любое другое неожидаемое сообщение. Ожидаемым может быть только abort/timeout
        _handleResponseError(dispatcher, ctx, message, "Context ожидал сообщение типа 'service.ack'")
      }
    },
  }
  if (abortSignal || timeout > 0) {
    _useAbortTimeoutController(ctx, abortSignal, timeout)
  }
  // Контроллер уже может быть aborted
  if (ctx._controller?.status) {
    ctx._promiseAck = false
    ctx._promiseResult = ctx as TResponse<TMdpDecodedService>
    if (ctx._controller.status === INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout) {
      ctx.timeout()
    }
    else {
      ctx.abort()
    }
  }
  return ctx
}

/**
 * Создает контекст для сообщений ожидающих ответа на `request` и возможного подтверждения `needAck`.
 */
function mdpEndpointCreateResponseContext (
  dispatcher: MdpEndpointDispatcher,
  id: TPositiveInteger,
  endpoint: TNonemptyString,
  timeout: number,
  abortSignal: undefined | null | AbortSignal,
  needAck: boolean
): MdpEndpointResponseContextLike<any> & IMdpEndpointInternalContext<TMdpDecodedResponse> {
  const ctx: MdpEndpointResponseContextLike<any> & _IMdpEndpointContext<TMdpDecodedResponse> = {
    [CTX_LIKE_]: null,
    [CTX_RESPONSE_]: null,
    get id () {
      return id
    },
    endpoint,
    _status: MDP_ENDPOINT_CONTEXT_STATUS_CODES.none,
    get status () {
      return ctx._status
    },
    ok: false,
    value: null, // TMdpDecodedResponse
    error: null,
    isFinished () { return ctx._status !== MDP_ENDPOINT_CONTEXT_STATUS_CODES.none },
    abort () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort, null, true)
    },
    timeout () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.timeout, null, true)
    },
    _promiseAck: null,
    _resolveAck (value: boolean) {
      const resolve = ctx._promiseAckResolve
      ctx._promiseAckResolve = null
      if (resolve) {
        ctx._promiseAck = value
        resolve(value)
      }
      else if (ctx._promiseAck === null) {
        ctx._promiseAck = value
      }
    },
    ack () {
      if (ctx._promiseAck === null) {
        ctx._promiseAck = new Promise<boolean>((resolve) => ctx._promiseAckResolve = resolve)
      }
      return ctx._promiseAck
    },
    _promiseResult: null,
    _resolveResult (value: TResponse<TMdpDecodedResponse>) {
      const resolve = ctx._promiseResultResolve
      ctx._promiseResultResolve = null
      if (resolve) {
        ctx._promiseResult = value
        resolve(value)
      }
      else if (ctx._promiseResult === null) {
        ctx._promiseResult = value
      }
    },
    result (): TResponse<TMdpDecodedResponse> | Promise<TResponse<TMdpDecodedResponse>> {
      if (ctx._promiseResult === null) {
        ctx._promiseResult = new Promise((resolve) => ctx._promiseResultResolve = resolve)
      }
      return ctx._promiseResult
    },
    async _getResultAsync () {
      await Promise.resolve()
      return ctx.result()
    },
    _update (message: TMdpDecodedService | TMdpDecodedBinary | TMdpDecodedResponse) {
      if (ctx.isFinished()) {
        return
      }
      if (message.type === MFP_FRAME_TYPES.response) {
        ctx._controller?.disable()
        dispatcher[I_OUTGOING_].delete(id)
        ctx._status = MDP_ENDPOINT_CONTEXT_STATUS_CODES.complete
        ctx.ok = true
        ctx.value = message
        ctx._resolveAck?.(true)
        ctx._resolveResult?.(ctx as TResponse<TMdpDecodedResponse>)
      }
      else if (message.type === MFP_FRAME_TYPES.service && message.ack && message.refId === id) {
        ctx._resolveAck?.(true)
      }
      else {
        ctx._controller?.disable()
        dispatcher[I_OUTGOING_].delete(id)
        // Любое другое неожидаемое сообщение. Ожидаемым может быть только abort/timeout
        _handleResponseError(dispatcher,
          // Глушим ошибку типа TMdpDecodedResponse vs TMdpDecodedService. Фактически здесь должен быть TMdpDecodedResponse,
          // но результат контекста определяется полем ok, а value:TMdpDecodedService можно использовать для лога
          // @ts-expect-error
          ctx,
          message, "Context ожидал сообщение типа 'response' или `service.ack`")
      }
    },
  }
  if (abortSignal || timeout > 0) {
    _useAbortTimeoutController(ctx, abortSignal, timeout)
  }
  // Контроллер уже может быть aborted
  if (ctx._controller?.status) {
    ctx._promiseAck = false
    ctx._promiseResult = ctx as TResponse<TMdpDecodedResponse>
    if (ctx._controller.status === INTERRUPT_CONTROLLER_EXIT_STATUSES.timeout) {
      ctx.timeout()
    }
    else {
      ctx.abort()
    }
  }
  else if (!needAck) {
    ctx._promiseAck = true
  }
  return ctx
}

/**
 * Создает контекст запроса и ожидает пользовательского ответа.
 */
function mdpEndpointCreateRequestContext (
  dispatcher: MdpEndpointDispatcher,
  message: TMdpDecodedRequest<any>,
  responseId: TPositiveInteger,
  defaultOptions: TMdpEndpointReadonlyOptions
): MdpEndpointRequestContextLike & IMdpEndpointInternalContext<TMdpDecodedService> {
  const id = message.id as TPositiveInteger
  const endpoint = message.endpoint as TNonemptyString
  const ctx: MdpEndpointRequestContextLike & _IMdpEndpointContext<TMdpDecodedService> = {
    [CTX_LIKE_]: null,
    [CTX_REQUEST_]: null,
    get id () {
      return id
    },
    get endpoint () {
      return endpoint
    },
    message,
    get responseId () {
      return responseId
    },
    _status: MDP_ENDPOINT_CONTEXT_STATUS_CODES.none,
    get status () {
      return ctx._status
    },
    ok: false,
    value: null,
    error: null,
    isFinished () { return ctx._status !== MDP_ENDPOINT_CONTEXT_STATUS_CODES.none },
    abort () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort, null, true)
    },
    timeout () {
      _handleAbortOrTimeout(dispatcher, ctx, MDP_ENDPOINT_CONTEXT_STATUS_CODES.timeout, null, true)
    },
    _promiseAck: null,
    _resolveAck (value: boolean) {
      const resolve = ctx._promiseAckResolve
      ctx._promiseAckResolve = null
      if (resolve) {
        ctx._promiseAck = value
        resolve(value)
      }
      else if (ctx._promiseAck === null) {
        ctx._promiseAck = value
      }
    },
    ack () {
      if (ctx._promiseAck === null) {
        ctx._promiseAck = new Promise<boolean>((resolve) => ctx._promiseAckResolve = resolve)
      }
      return ctx._promiseAck
    },
    _promiseResult: null,
    _resolveResult (value: TResponse<TMdpDecodedService>) {
      const resolve = ctx._promiseResultResolve
      ctx._promiseResultResolve = null
      if (resolve) {
        ctx._promiseResult = value
        resolve(value)
      }
      else if (ctx._promiseResult === null) {
        ctx._promiseResult = value
      }
    },
    result (): TResponse<TMdpDecodedService> | Promise<TResponse<TMdpDecodedService>> {
      if (ctx._promiseResult === null) {
        ctx._promiseResult = new Promise((resolve) => ctx._promiseResultResolve = resolve)
      }
      return ctx._promiseResult
    },
    async _getResultAsync () {
      await Promise.resolve()
      return ctx.result()
    },
    // Здесь может быть только отмена запроса или подтверждение, если в ответе указан needAck
    _update (message: TMdpDecodedService | TMdpDecodedBinary | TMdpDecodedResponse) {
      ctx._controller?.disable()
      dispatcher[I_OUTGOING_].delete(id)
      if (ctx.isFinished()) {
        return
      }
      if (message.type === MFP_FRAME_TYPES.service && message.ack && message.refId === responseId) {
        ctx._status = MDP_ENDPOINT_CONTEXT_STATUS_CODES.complete
        ctx.ok = true
        ctx.value = message
        ctx._resolveAck?.(true)
        ctx._resolveResult?.(ctx as TResponse<TMdpDecodedService>)
      }
      else {
        // Любое другое неожидаемое сообщение. Ожидаемым может быть только abort/timeout
        _handleResponseError(dispatcher, ctx, message, "Context ожидал сообщение типа 'service.ack'")
      }
    },
    reply (options: TMdpMessageOptions<any> & TMdpTimeoutOptions): TResponse<TMdpDecodedService> | Promise<TResponse<TMdpDecodedService>> {
      // Здесь мог быть timeout
      if (!dispatcher[I_INCOMING_].delete(id) || ctx.isFinished()) {
        // На всякий случай
        ctx._resolveAck?.(false)
        ctx._resolveResult?.(ctx as TResponse<TMdpDecodedService>)
        return ctx as TResponse<TMdpDecodedService>
      }
      let code: TRequestErrorStatus_ = MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack
      const normalized = normalizeMessage_(defaultOptions, options, false) as TMdpResponseOptions<any>
      normalized.refId = id
      try {
        const frame = dispatcher.framer.encodeResponseWithId(responseId, endpoint, normalized)
        code = MDP_ENDPOINT_CONTEXT_STATUS_CODES.error
        dispatcher.connector.sendOrThrow(frame)
      } catch (e) {
        ctx._controller?.disable()
        ctx.ok = false
        ctx.value = null
        ctx.error = _ensureRequestError(code, e)
        ctx._resolveAck?.(false)
        ctx._resolveResult?.(ctx as TResponse<TMdpDecodedService>)
        return ctx as TResponse<TMdpDecodedService>
      }
      // Если опции не имеют needAck, то сразу возвращаем ответ, иначе перекладываем в исходящие
      if (normalized.needAck) {
        dispatcher[I_OUTGOING_].set(responseId, ctx)
      }
      return ctx._getResultAsync()
    }
  }
  if (defaultOptions.timeout > 0) {
    _useAbortTimeoutController(ctx, null, defaultOptions.timeout)
  }
  return ctx
}

export {
  I_ENDPOINTS_,
  I_OUTGOING_,
  I_INCOMING_,
  I_MESSAGE_CONTEXT_,
  I_MESSAGE_LITE_,
  I_RESPONSE_CONTEXT_,
  I_BINARY_CONTEXT_,
  I_BINARY_LITE_,
  I_PING_CONTEXT_,
  I_TIMEOUT_OR_ABORT_,
  I_ENDPOINT_HANDLER_,
  MDP_ENDPOINT_DISPATCHER_INTERNAL,
  type TRequestContextKind_,
  type TRequestErrorStatus_,
  type TCtxInterruptCode_,
  type TInterruptStatus_,
  type IMdpEndpointInternalContext,
  normalizeMessage_,
  normalizeRequest_,
  normalizeBinary_,
  mdpEndpointCreateErrorContext,
  mdpEndpointCreateAckContextOk,
  mdpEndpointCreateAckContext,
  mdpEndpointCreateResponseContext,
  mdpEndpointCreateRequestContext
}
