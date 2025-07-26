import { ApiRouterError, ConfigureError, errorDetails, PackError, SendError, UnpackError } from '../errors.js'
import {
  type JsonLike,
  type TNonemptyString,
  type TPositiveInteger,
  type TResponse,
  type UOptional,
  positiveNumberOrNull,
  uselessFunctionStub_
} from '../types.js'
import { booleanOrNull, isNonemptyString, isString } from '../utils.js'
import {
  type BinaryTransportLike,
  type TBinaryTransportEventName,
  BINARY_TRANSPORT_EVENT_NAMES
} from '../interfaces/BinaryTransportLike.js'
import { WhenReadyController } from '../libs/WhenReadyController.js'
import type {
  TMdpAnnounceOptions,
  TMdpBinaryOptions,
  TMdpDecodedBinary,
  TMdpDecodedData,
  TMdpDecodedMessage,
  TMdpDecodedRequest,
  TMdpDecodedResponse,
  TMdpDecodedService,
  TMdpMessageOptions,
  TMdpRequestOptions
} from '../mdp/types.js'
import { MdpFramer, verifyEndpointName_ } from '../mdp/MdpFramer.js'
import { type TMfpServiceCodes, MFP_FRAME_TYPES, MFP_SERVICE_CODES } from '../mfp/types.js'
import { WebSocketConnector } from '../ws/WebSocketConnector.js'
import {
  type TMdpDispatcherOptions,
  type TMdpDispatcherHandler,
  type TMdpEndpointDispatcherReadonlyOptions,
  type TMdpEndpointEventCode,
  type TMdpEndpointEventCodes,
  type TMdpEndpointHandler,
  type TMdpTimeoutOptions,
  type TMdpEndpointReadonlyOptions,
  type MdpEndpointContextLike,
  type MdpEndpointAckContextLike,
  type MdpEndpointResponseContextLike,
  MDP_ENDPOINT_CONTEXT_STATUS_CODES,
  MDP_ENDPOINT_EVENT_CODES
} from './types.js'
import {
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
  type TRequestErrorStatus_,
  type IMdpEndpointInternalContext,
  normalizeMessage_,
  normalizeRequest_,
  normalizeBinary_,
  mdpEndpointCreateErrorContext,
  mdpEndpointCreateAckContextOk,
  mdpEndpointCreateAckContext,
  mdpEndpointCreateResponseContext,
  mdpEndpointCreateRequestContext,
  type TCtxInterruptCode_
} from './contexts.js'
import { MdpEndpoint } from './MdpEndpoint.js'

/**
 * Заполнитель для контекста у которого нет имени: `ping` и `binary`.
 */
const MDP_ENDPOINT_CTX_NONAME = 'f67ac0ec-7e67-4df0-8d46-37ed2be10630'

function _eventMap (): TMdpEndpointEventCodes['open' | 'close' | 'error' | 'unpack'][] {
  const array = []
  array[BINARY_TRANSPORT_EVENT_NAMES.open] = MDP_ENDPOINT_EVENT_CODES.open
  array[BINARY_TRANSPORT_EVENT_NAMES.close] = MDP_ENDPOINT_EVENT_CODES.close
  array[BINARY_TRANSPORT_EVENT_NAMES.error] = MDP_ENDPOINT_EVENT_CODES.error
  array[BINARY_TRANSPORT_EVENT_NAMES.type] = MDP_ENDPOINT_EVENT_CODES.unpack
  return array as TMdpEndpointEventCodes['open' | 'close' | 'error' | 'unpack'][]
}
const _connectionEventName2Code = Object.freeze(_eventMap())

/**
 * Диспетчер конечных точек - Реализация клиента для протокола {@link MfpFramer}.
 */
class MdpEndpointDispatcher {
  private readonly [I_ENDPOINTS_] = new Map<TNonemptyString, MdpEndpoint>()
  /**
   * Контексты созданные локально(идентификаторы которых сформированы здесь), которые ждут подтверждения.
   */
  private readonly [I_OUTGOING_] = new Map<number, MdpEndpointContextLike<any> & IMdpEndpointInternalContext<any>>()
  /**
   * Контексты сформированные для внешних запросов(внешние идентификаторы) и ожидающие завершения ответа.
   * Эти контексты конфликтуют по ключам с `_requests` и должны храниться отдельно.
   */
  private readonly [I_INCOMING_] = new Map<number, MdpEndpointContextLike<any> & IMdpEndpointInternalContext<any>>()
  private readonly _url: string
  private readonly _connector: BinaryTransportLike<ArrayBuffer, ArrayBuffer>
  private readonly _framer: MdpFramer
  private readonly _options: TMdpEndpointDispatcherReadonlyOptions
  private _handler: TMdpDispatcherHandler<any>
  private _whenReadyController = new WhenReadyController()

  protected _onState = async (type:/* 'open' | 'close' | 'error' | 'type'*/ TBinaryTransportEventName, error?: undefined | null | ApiRouterError) => {
    const code = _connectionEventName2Code[type]!
    if (code === MDP_ENDPOINT_EVENT_CODES.open || code === MDP_ENDPOINT_EVENT_CODES.close) {
      this._whenReadyController.resolve(code === MDP_ENDPOINT_EVENT_CODES.open)
    }
    await this._safeHandlerAsync(code, error)
    if (code === MDP_ENDPOINT_EVENT_CODES.unpack) {
      return
    }
    for (const client of this[I_ENDPOINTS_].values()) {
      if (client.enabled) {
        client[I_ENDPOINT_HANDLER_](code, error)
      }
    }
  }

  protected _onReceive = (_: any, buffer: ArrayBuffer) => {
    let decoded!: TMdpDecodedData
    try {
      decoded = this._framer.decode(buffer)
    } catch (e) {
      if (!(e instanceof ApiRouterError)) {
        e = new UnpackError(errorDetails.UnpackError('Не удалось декодировать фрейм сообщения или формат данных не соответствует ожидаемому.', e))
      }
      this._safeHandlerAsync(MDP_ENDPOINT_EVENT_CODES.unpack, e)
      return
    }

    // ping для Service обработается в _incomingService()
    if (decoded.type === MFP_FRAME_TYPES.service) {
      this._incomingService(decoded)
      return
    }

    // Для всех остальных сообщений может требоваться подтверждение
    if (decoded.needAck) {
      this._replyService(decoded.id, MFP_SERVICE_CODES.ack)
    }

    if (decoded.type === MFP_FRAME_TYPES.request) {
      this._incomingRequest(decoded)
    }
    else if (decoded.type === MFP_FRAME_TYPES.response) {
      this._incomingResponse(decoded)
    }
    else if (decoded.type === MFP_FRAME_TYPES.message) {
      this._incomingMessage(decoded)
    }
    else /* decoded.type === MFP_FRAME_TYPES.binary */ {
      this._incomingBinary(decoded)
    }
  }

  constructor(urlOrOptions: string | TMdpDispatcherOptions) {
    const options = isString(urlOrOptions) ? { url: urlOrOptions } : urlOrOptions
    this._url = options.url
    if (options.connector) {
      this._connector = options.connector
      options.connector.changeReceiveHandler(this._onReceive)
      options.connector.changeStateHandler(this._onState)
    }
    else {
      this._connector = new WebSocketConnector(this._url, {
        binaryType: 'arraybuffer',
        receiveHandler: this._onReceive,
        stateHandler: this._onState,
        retries: options.retries,
        retryDelay: options.retries
      })
    }
    this._framer = options.mdpFramer ?? new MdpFramer(options)
    this._handler = options.handler ?? uselessFunctionStub_
    this._options = Object.freeze({
      timeout: positiveNumberOrNull(options?.timeout) ?? 0,
      timeoutAck: positiveNumberOrNull(options?.timeoutAck) ?? 0,
      needAck: !!options.needAck,
      checksum: !!options.checksum,
      checksumService: !!options.checksumService,
      autoAbort: !options.noAutoAbort,
      reservedBinaryEndpoint: isNonemptyString(options.reservedBinaryEndpoint) ? options.reservedBinaryEndpoint : null
    })
  }

  get url (): string { return this._url }
  get options (): TMdpEndpointDispatcherReadonlyOptions { return this._options }
  get endpoints (): ReadonlyMap<string, MdpEndpoint> { return this[I_ENDPOINTS_] }
  get connector (): BinaryTransportLike<ArrayBuffer, ArrayBuffer, string> { return this._connector }
  isEnabled (): boolean { return this._connector.isEnabled() }
  isConnected (): boolean { return this._connector.isConnected() }
  get framer (): MdpFramer { return this._framer }

  private _verifyFreeEndpointName (endpoint: any | TNonemptyString): void {
    verifyEndpointName_(endpoint)
    if (this[I_ENDPOINTS_].has(endpoint)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Имя endpoint:"${endpoint}" занято и находится в списке выделенных клиентов.`))
    }
  }

  private _safeHandlerQueue = Promise.resolve()
  private async _safeHandlerAsync (code: any, value: any): Promise<void> {
    const previous = this._safeHandlerQueue
    let finalize!: (() => any)
    this._safeHandlerQueue = new Promise((resolve) => finalize = resolve)
    await previous
    try {
      this._handler(code, value)
    } catch (e) {
      console.error(e)
    } finally {
      finalize()
    }
  }

  /**
   * Отправляет сервисное сообщение, устанавливая `ownRefId: false`.
   *
   * @param refId Идентификатор сгенерированный на противоположной стороне.
   */
  private _replyService (refId: number, serviceCode: TMfpServiceCodes['ack' | 'abort']): void {
    let code: number = MDP_ENDPOINT_EVENT_CODES.pack
    try {
      const frame = this._framer.encodeService({
        code: serviceCode,
        refId,
        ownRefId: false,
        checksum: this._options.checksumService
      })
      code = MDP_ENDPOINT_EVENT_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      if (!(e instanceof ApiRouterError)) {
        e = new SendError(errorDetails.SendError(`Не удалось вернуть '${serviceCode === MFP_SERVICE_CODES.ack ? 'ack' : 'abort'}' на запрос id:${refId}.`, e))
      }
      this._safeHandlerAsync(code, e)
    }
  }

  private _incomingService (data: TMdpDecodedService): void {
    if (data.ping) {
      this._replyService(data.id, MFP_SERVICE_CODES.ack)
    }
    else {
      const ctx = this[data.ownRefId ? I_INCOMING_ : I_OUTGOING_].get(data.refId)
      if (ctx) {
        ctx._update(data)
      }
      else {
        this._safeHandlerAsync(MDP_ENDPOINT_EVENT_CODES.unknown, data)
      }
    }
  }

  private _incomingMessage (message: TMdpDecodedMessage<any>): void {
    const endpoint = this[I_ENDPOINTS_].get(message.endpoint as TNonemptyString)
    if (endpoint?.enabled) {
      endpoint[I_ENDPOINT_HANDLER_](MDP_ENDPOINT_EVENT_CODES.message, message)
    }
    else {
      let code: TMdpEndpointEventCode
      if (endpoint) {
        code = MDP_ENDPOINT_EVENT_CODES.unknown
        if (this._options.autoAbort && (message.expected || message.streaming)) {
          this._replyService(message.id, MFP_SERVICE_CODES.abort)
        }
      }
      else {
        code = MDP_ENDPOINT_EVENT_CODES.message
      }
      this._safeHandlerAsync(code, message)
    }
  }

  private _incomingBinary (message: TMdpDecodedBinary): void {
    const endpoint = this._options.reservedBinaryEndpoint
      ? this[I_ENDPOINTS_].get(this._options.reservedBinaryEndpoint as TNonemptyString)
      : null
    if (endpoint?.enabled) {
      endpoint[I_ENDPOINT_HANDLER_](MDP_ENDPOINT_EVENT_CODES.binary, message)
    }
    else {
      let code: TMdpEndpointEventCode
      if (endpoint) {
        code = MDP_ENDPOINT_EVENT_CODES.unknown
        if (this._options.autoAbort) {
          this._replyService(message.refId, MFP_SERVICE_CODES.abort)
        }
      }
      else {
        code = MDP_ENDPOINT_EVENT_CODES.binary
      }
      this._safeHandlerAsync(code, message)
    }
  }

  private _incomingRequest (message: TMdpDecodedRequest<any>): void {
    const endpoint = this[I_ENDPOINTS_].get(message.endpoint as TNonemptyString)
    if (!endpoint) {
      const ctx = mdpEndpointCreateRequestContext(this, message, this._framer.nextId(), this._options)
      this[I_INCOMING_].set(ctx.id, ctx)
      this._safeHandlerAsync(MDP_ENDPOINT_EVENT_CODES.request, ctx)
    }
    else if (endpoint.enabled) {
      const ctx = mdpEndpointCreateRequestContext(this, message, this._framer.nextId(), endpoint.options)
      this[I_INCOMING_].set(ctx.id, ctx)
      endpoint[I_ENDPOINT_HANDLER_](MDP_ENDPOINT_EVENT_CODES.request, ctx)
    }
    else {
      if (this._options.autoAbort) {
        this._replyService(message.id, MFP_SERVICE_CODES.abort)
      }
      this._safeHandlerAsync(MDP_ENDPOINT_EVENT_CODES.unknown, message)
    }
  }

  private _incomingResponse (message: TMdpDecodedResponse<any>): void {
    // Если контекст жив, значит и endpoint себя не удалял.
    const ctx = this[I_OUTGOING_].get(message.refId)
    if (ctx) {
      ctx._update(message)
    }
    else {
      this._safeHandlerAsync(MDP_ENDPOINT_EVENT_CODES.unknown, message)
    }
  }

  /**
   * Вызывается из контекстов для отправки сообщений с прерываниями `timeout/abort`.
   *
   * **Note:** Прерывания могут быть инициированы установленными `timeout`, пользовательским `AbortSignal` или явным
   * вызовом методов. Ошибки отправки сообщений попадают только в общий обработчик.
   *
   * @param refId    Идентификатор связанного сообщения.
   * @param ownRefId Принадлежность `refId`. Контексты должны сами сообщить о принадлежности.
   * @param aOrT     Один из допустимых кодов.
   */
  protected [I_TIMEOUT_OR_ABORT_] (refId: number, ownRefId: boolean, aOrT: TCtxInterruptCode_): void {
    let code: TMdpEndpointEventCode = MDP_ENDPOINT_EVENT_CODES.pack
    try {
      const frame = this._framer.encodeService({
        refId,
        ownRefId,
        code: aOrT === MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort
          ? MFP_SERVICE_CODES.abort
          : MFP_SERVICE_CODES.timeout,
        checksum: this._options.checksumService
      })
      code = MDP_ENDPOINT_EVENT_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      if (!(e instanceof ApiRouterError)) {
        const msg = `Не удалось отправить запрос прерывания '${aOrT === MDP_ENDPOINT_CONTEXT_STATUS_CODES.abort ? 'abort' : 'timeout'}' для refId:${refId}.`
        e = code === MDP_ENDPOINT_EVENT_CODES.pack
          ? new PackError(errorDetails.PackError(msg, e))
          : new SendError(errorDetails.SendError(msg, e))
      }
      this._safeHandlerAsync(code, e)
    }
  }

  [I_PING_CONTEXT_] (
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions?: TMdpTimeoutOptions
  ): MdpEndpointAckContextLike {
    const id = this._framer.nextId()
    let code: TRequestErrorStatus_ = MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack
    try {
      const frame = this._framer.encodeServiceWithId(id, {
        code: MFP_SERVICE_CODES.ping,
        refId: id,
        ownRefId: true,
        checksum: this._options.checksumService
      })
      code = MDP_ENDPOINT_CONTEXT_STATUS_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      return mdpEndpointCreateErrorContext(0, id, MDP_ENDPOINT_CTX_NONAME as TNonemptyString, code, e)
    }
    const ctx = mdpEndpointCreateAckContext(
      this,
      id,
      MDP_ENDPOINT_CTX_NONAME as TNonemptyString,
      requestOptions?.timeout ?? defaultOptions.timeoutAck,
      requestOptions?.abortSignal,
      false
    )
    if (!ctx.isFinished()) {
      this[I_OUTGOING_].set(id, ctx)
    }
    return ctx
  }

  protected [I_MESSAGE_CONTEXT_] (
    endpoint: string,
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions: TMdpMessageOptions<any> & TMdpTimeoutOptions,
    announce: boolean,
    fromDispatcher: boolean
  ): MdpEndpointAckContextLike & IMdpEndpointInternalContext<any> {
    const id = this._framer.nextId()
    let code: TRequestErrorStatus_ = MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack
    const normalized = normalizeMessage_(defaultOptions, requestOptions, announce)
    try {
      if (fromDispatcher) {
        this._verifyFreeEndpointName(endpoint)
      }
      const frame = announce
        ? this._framer.encodeAnnounceWithId(id, endpoint, normalized)
        : this._framer.encodeMessageWithId(id, endpoint, normalized)
      code = MDP_ENDPOINT_CONTEXT_STATUS_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      // Ошибка кодирования или сокета. Не создаем полноценный контекст и сразу возвращаем с ошибкой.
      return mdpEndpointCreateErrorContext(0, id, endpoint as TNonemptyString, code, e)
    }
    // Если нет подтверждения сразу создаем контекст ok, иначе сохраняем
    if (normalized.needAck) {
      const ctx = mdpEndpointCreateAckContext(
        this,
        id,
        endpoint as TNonemptyString,
        requestOptions.timeout ?? defaultOptions.timeoutAck,
        requestOptions.abortSignal,
        true
      )
      // abortSignal уже может быть aborted
      if (!ctx.isFinished()) {
        this[I_OUTGOING_].set(id, ctx)
      }
      return ctx
    }
    return mdpEndpointCreateAckContextOk(id, endpoint as TNonemptyString, this._framer.decodedServiceSelfAck(id))
  }

  protected [I_MESSAGE_LITE_] (
    endpoint: string,
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions: TMdpMessageOptions<any> & TMdpTimeoutOptions,
    announce: boolean,
    fromDispatcher: boolean
  ): null | TPositiveInteger {
    const id = this._framer.nextId()
    const normalized = normalizeMessage_(defaultOptions, requestOptions, announce)
    normalized.needAck = false
    try {
      if (fromDispatcher) {
        this._verifyFreeEndpointName(endpoint)
      }
      const frame = announce
        ? this._framer.encodeAnnounceWithId(id, endpoint, normalized)
        : this._framer.encodeMessageWithId(id, endpoint, normalized)
      this._connector.sendOrThrow(frame)
    } catch (_) {
      return null
    }
    return id
  }

  protected [I_RESPONSE_CONTEXT_] (
    endpoint: string,
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions: TMdpRequestOptions<any> & TMdpTimeoutOptions,
    ignoreNeedAck: boolean,
    fromDispatcher: boolean
  ): MdpEndpointResponseContextLike<any> & IMdpEndpointInternalContext<any> {
    const id = this._framer.nextId()
    let code: TRequestErrorStatus_ = MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack
    const normalized = normalizeRequest_(defaultOptions, requestOptions)
    if (ignoreNeedAck) {
      normalized.needAck = false
    }
    try {
      if (fromDispatcher) {
        this._verifyFreeEndpointName(endpoint)
      }
      const frame = this._framer.encodeRequestWithId(id, endpoint, normalized)
      code = MDP_ENDPOINT_CONTEXT_STATUS_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      return mdpEndpointCreateErrorContext(1, id, endpoint as TNonemptyString, code, e)
    }
    const ctx = mdpEndpointCreateResponseContext(
      this,
      id,
      endpoint as TNonemptyString,
      requestOptions.timeout ?? defaultOptions.timeout, // Здесь timeout а не timeoutAck
      requestOptions.abortSignal,
      normalized.needAck!
    )
    if (!ctx.isFinished()) {
      this[I_OUTGOING_].set(id, ctx)
    }
    return ctx
  }

  protected [I_BINARY_CONTEXT_] (
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions: TMdpBinaryOptions & TMdpTimeoutOptions,
    ignoreNeedAck: boolean
  ): MdpEndpointAckContextLike & IMdpEndpointInternalContext<any> {
    const id = this._framer.nextId()
    let code: TRequestErrorStatus_ = MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack
    const normalized = normalizeBinary_(defaultOptions, requestOptions)
    if (ignoreNeedAck) {
      normalized.needAck = false
    }
    try {
      const frame = this._framer.encodeBinaryWithId(id, normalized)
      code = MDP_ENDPOINT_CONTEXT_STATUS_CODES.error
      this._connector.sendOrThrow(frame)
    } catch (e) {
      return mdpEndpointCreateErrorContext(0, id, MDP_ENDPOINT_CTX_NONAME as TNonemptyString, code, e)
    }
    if (normalized.needAck) {
      const ctx = mdpEndpointCreateAckContext(
        this,
        id,
        MDP_ENDPOINT_CTX_NONAME as TNonemptyString,
        requestOptions.timeout ?? defaultOptions.timeoutAck,
        requestOptions.abortSignal,
        true
      )
      if (!ctx.isFinished()) {
        this[I_OUTGOING_].set(id, ctx)
      }
      return ctx
    }
    return mdpEndpointCreateAckContextOk(id, MDP_ENDPOINT_CTX_NONAME as TNonemptyString, this._framer.decodedServiceSelfAck(id))
  }

  protected [I_BINARY_LITE_] (
    defaultOptions: TMdpEndpointReadonlyOptions,
    requestOptions: TMdpBinaryOptions & TMdpTimeoutOptions
  ): null | TPositiveInteger {
    const id = this._framer.nextId()
    const normalized = normalizeBinary_(defaultOptions, requestOptions)
    normalized.needAck = false
    try {
      const frame = this._framer.encodeBinaryWithId(id, normalized)
      this._connector.sendOrThrow(frame)
    } catch (_) {
      return null
    }
    return id
  }

  /**
   * Отправляет `PING` запрос и возвращает контекст ожидания `ack`.
   *
   * @param options Поддерживается только `timeout` и `AbortSignal`.
   */
  pingContext (options?: TMdpTimeoutOptions): MdpEndpointAckContextLike {
    return this[I_PING_CONTEXT_](this._options, options)
  }

  /**
   * Отправляет сообщение и возвращает контекст с ожиданием `ack`.
   * Если опция {@link TMdpMessageOptions.needAck} не установлена, контекст сразу разрешается в `true`.
   *
   * @param endpoint Имя конечной точки. Конечная точка не должна быть зарезервирована.
   * @param options  Опции сообщения.
   */
  messageContext (endpoint: string, options: TMdpMessageOptions<any> & TMdpTimeoutOptions): MdpEndpointAckContextLike {
    return this[I_MESSAGE_CONTEXT_](endpoint, this._options, options, false, true)
  }

  /**
   * Отправляет сообщение и возвращает результат `ack`.
   * Если опция {@link TMdpMessageOptions.needAck} не установлена, контекст сразу разрешается в `true`.
   *
   * @param endpoint Имя конечной точки. Конечная точка не должна быть зарезервирована.
   * @param options  Опции сообщения.
   */
  message (endpoint: string, options: TMdpMessageOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedService>> {
    return this[I_MESSAGE_CONTEXT_](endpoint, this._options, options, false, true)._getResultAsync()
  }

  /**
   * Отправить сообщение игнорируя опцию `needAck`.
   * Если запрос тут же завершается ошибкой, возвратит `null`, иначе возвращает `id` сообщения.
   *
   * **Note:** Методы {@link message()} и {@link messageContext()} всегда создают контексты, даже если нет `needAck` или
   * произошла ошибка. Легкая версия не добавляет в запрос флага подтверждения `needAck`, не устанавливает `timeout` и
   * не создает контекст.
   *
   * @param endpoint Имя конечной точки. Конечная точка не должна быть зарезервирована.
   * @param options  Опции сообщения.
   */
  messageLite (endpoint: string, options: Omit<TMdpMessageOptions<any>, 'needAck'>): null | TPositiveInteger {
    return this[I_MESSAGE_LITE_](endpoint, this._options, options, false, true)
  }

  // ## Все три функции announceContext/announce/announceLite имеют ту же семантику что и message, но анонсируют начало
  // передачи файлов прикладываемых к данному id

  announceContext (endpoint: string, options: TMdpAnnounceOptions<any> & TMdpTimeoutOptions): MdpEndpointAckContextLike {
    return this[I_MESSAGE_CONTEXT_](endpoint, this._options, options, true, true)
  }

  announce (endpoint: string, options: TMdpAnnounceOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedService>> {
    return this[I_MESSAGE_CONTEXT_](endpoint, this._options, options, true, true)._getResultAsync()
  }

  announceLite (endpoint: string, options: Omit<TMdpAnnounceOptions<any>, 'needAck'>): null | TPositiveInteger {
    return this[I_MESSAGE_LITE_](endpoint, this._options, options, true, true)
  }

  // ## Все три функции binaryContext/binary/binaryLite имеют ту же семантику что и message, но отправляют один файл и
  // не имеют поля endpoint

  binaryContext (options: TMdpBinaryOptions & TMdpTimeoutOptions): MdpEndpointAckContextLike {
    return this[I_BINARY_CONTEXT_](this._options, options, false)
  }

  binary (options: TMdpBinaryOptions & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedService>> {
    return this[I_BINARY_CONTEXT_](this._options, options, false)._getResultAsync()
  }

  binaryLite (options: Omit<TMdpBinaryOptions, 'needAck'>): null | TPositiveInteger {
    return this[I_BINARY_LITE_](this._options, options)
  }

  /**
   * Отправляет запрос и возвращает контекст ожидания ответа.
   * Если опция {@link TMdpRequestOptions.needAck} не установлена, функция контекста
   * {@link MdpEndpointResponseContextLike.ack()} сразу разрешается в `true`.
   *
   * @param endpoint Имя конечной точки. Конечная точка не должна быть зарезервирована.
   * @param options  Опции запроса.
   */
  requestContext<T extends JsonLike> (endpoint: string, options: TMdpRequestOptions<any> & TMdpTimeoutOptions): MdpEndpointResponseContextLike<T> {
    return this[I_RESPONSE_CONTEXT_](endpoint, this._options, options, false, true)
  }

  /**
   * Отправляет запрос игнорируя опцию `needAck`.
   *
   * **Note:** Опция `needAck` бесполезна с использованием этого метода ввиду недоступности результата.
   *
   * @param endpoint Имя конечной точки. Конечная точка не должна быть зарезервирована.
   * @param options  Опции запроса.
   */
  request<T extends JsonLike> (endpoint: string, options: TMdpRequestOptions<any> & TMdpTimeoutOptions): Promise<TResponse<TMdpDecodedResponse<T>>> {
    return this[I_RESPONSE_CONTEXT_](endpoint, this._options, options, true, true)._getResultAsync()
  }

  hasEndpoint (endpoint: string | TNonemptyString): boolean {
    return this[I_ENDPOINTS_].has(endpoint as TNonemptyString)
  }

  endpoint (endpoint: string, handler?: undefined | null | TMdpEndpointHandler<any>, options?: undefined | null | UOptional<TMdpEndpointReadonlyOptions>): MdpEndpoint {
    this._verifyFreeEndpointName(endpoint)
    const opts: TMdpEndpointReadonlyOptions = Object.freeze({
      timeout: positiveNumberOrNull(options?.timeout) ?? this._options.timeout,
      timeoutAck: positiveNumberOrNull(options?.timeoutAck) ?? this._options.timeoutAck,
      needAck: booleanOrNull(options?.needAck) ?? this._options.needAck,
      checksum: booleanOrNull(options?.checksum) ?? this._options.checksum
    })
    const client = new MdpEndpoint(this, endpoint as TNonemptyString, opts, handler)
    this[I_ENDPOINTS_].set(endpoint as TNonemptyString, client)
    return client
  }

  /**
   * Изменить обработчика сообщений и запросов.
   *
   * @param handler Обработчик принимающий параметром сообщение, контекст для возврата ответа на запрос или ошибки и состояние подключения.
   */
  changeHandler (handler: TMdpDispatcherHandler<any>): void {
    this._handler = handler
  }

  enable (enable: boolean): void {
    this._connector.enable(enable)
  }

  whenReady (): boolean | Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }
    if (this.isConnected()) {
      return true
    }
    return this._whenReadyController.charge()
  }
}

export {
  MdpEndpointDispatcher
}
