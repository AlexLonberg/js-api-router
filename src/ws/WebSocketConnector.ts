
import { type ApiRouterError, errorDetails, DataTypeError, ConnectionError, SendError } from '../errors.js'
import { type TFnRetryDelay, type TPositiveInteger, fnRetryDelayOrNull, isPositiveInteger, uselessFunctionStub_ } from '../types.js'
import { isArray, isFunction, isNonemptyString, safeToJson } from '../utils.js'
import { WhenReadyController } from '../libs/WhenReadyController.js'
import {
  type TBinaryTransportEventName,
  BINARY_TRANSPORT_EVENT_NAMES,
  BinaryTransportLike
} from '../interfaces/BinaryTransportLike.js'
import {
  type TWebSocketMessageType,
  type UWebSocketMessageTypeOf,
  type TWsReceiveHandler,
  type TWsStateHandler,
  type TWebSocketConnectorOptions,
  webSocketMessageTypes
} from './types.js'

function ensureProtocols (value: any): undefined | string | readonly string[] {
  if (isNonemptyString(value)) {
    return value
  }
  if (isArray(value)) {
    const arr: string[] = []
    for (const item of value) {
      if (isNonemptyString(item)) {
        arr.push(item)
      }
    }
    if (arr.length > 0) {
      return Object.freeze(arr)
    }
  }
  return undefined
}

class WebSocketConnector<T extends TWebSocketMessageType> extends BinaryTransportLike<string | ArrayBufferLike | Blob | ArrayBufferView, UWebSocketMessageTypeOf<T>, T> {
  protected readonly _binaryTypes = new Set<TWebSocketMessageType>()
  protected readonly _binaryType: BinaryType
  protected readonly _maxRetries: TPositiveInteger
  protected readonly _retryDelay: TFnRetryDelay
  protected _retries = 0
  protected _enabled = false
  protected _url: string
  protected _protocols: undefined | string | readonly string[]
  protected _receiveHandler: TWsReceiveHandler
  protected _stateHandler: TWsStateHandler
  protected _socket: null | WebSocket = null
  protected _whenReadyController = new WhenReadyController()
  protected _lastEvent: TBinaryTransportEventName = BINARY_TRANSPORT_EVENT_NAMES.close //'open' | 'close' | 'error' | 'type'

  protected readonly _onOpen = (_e: WebSocketEventMap['open']) => {
    this._retries = 0
    this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.open)
    this._whenReadyController.resolve(true)
  }

  protected readonly _onMessage = (e: WebSocketEventMap['message']) => {
    const data = e.data
    const type = typeof data
    if (this._binaryTypes.has('string') && type === 'string') {
      this._receiveHandler('string', data)
    }
    else if (this._binaryTypes.has('arraybuffer') && (data instanceof ArrayBuffer)) {
      this._receiveHandler('arraybuffer', data)
    }
    else if (this._binaryTypes.has('blob') && (data instanceof Blob)) {
      this._receiveHandler('blob', data)
    }
    else {
      const error = errorDetails.DataTypeError(`Неожидаемый тип данных сокета '${type}', ожидалось ${safeToJson([...this._binaryTypes])}`)
      error.url = this._url
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.type, new DataTypeError(error))
    }
  }

  protected readonly _onClose = (e: WebSocketEventMap['close']) => {
    this._close(!this._enabled)
    if (this._enabled) {
      const detail = errorDetails.ConnectionError(undefined, e.reason)
      detail.url = this._url
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.error, new ConnectionError(detail))
      this._reconnect()
    }
    else {
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.close)
    }
  }

  protected readonly _onError = (_e: WebSocketEventMap['error']) => {
    const detail = errorDetails.ConnectionError()
    detail.url = this._url
    this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.error, new ConnectionError(detail))
  }

  constructor(url: string, options?: undefined | null | TWebSocketConnectorOptions<T>) {
    super()
    this._url = url
    this._protocols = ensureProtocols(options?.protocols)
    const bt = isArray(options?.binaryType) ? options.binaryType : [options?.binaryType!]
    for (const item of bt) {
      if (webSocketMessageTypes.includes(item as any)) {
        this._binaryTypes.add(item as TWebSocketMessageType)
      }
    }
    if (this._binaryTypes.size === 0) {
      for (const item of webSocketMessageTypes) {
        this._binaryTypes.add(item as TWebSocketMessageType)
      }
    }
    if (this._binaryTypes.has('blob') || !this._binaryTypes.has('arraybuffer')) {
      this._binaryType = 'blob'
      this._binaryTypes.delete('arraybuffer')
    }
    else {
      this._binaryType = 'arraybuffer'
      this._binaryTypes.delete('blob')
    }

    if (isPositiveInteger(options?.retries)) {
      this._maxRetries = options.retries
    }
    else {
      this._maxRetries = Number.MAX_SAFE_INTEGER as TPositiveInteger
    }
    this._retryDelay = fnRetryDelayOrNull(options?.retryDelay) ?? ((_: any) => 0) as TFnRetryDelay
    this._stateHandler = isFunction(options?.stateHandler) ? options.stateHandler : uselessFunctionStub_
    this._receiveHandler = (isFunction(options?.receiveHandler) ? options.receiveHandler : uselessFunctionStub_) as TWsReceiveHandler
  }

  get url (): string {
    return this._url
  }

  get protocols (): undefined | string | readonly string[] {
    return this._protocols
  }

  get readyState (): 0 | 1 | 2 | 3 {
    return this._socket ? this._socket.readyState as 0 | 1 | 2 | 3 : WebSocket.CLOSED
  }

  isEnabled (): boolean {
    return this._enabled
  }

  isConnected (): boolean {
    return this._socket ? this._socket.readyState === WebSocket.OPEN : false
  }

  protected _stateEvent (eventName: TBinaryTransportEventName, detail?: ApiRouterError): void {
    if (eventName === BINARY_TRANSPORT_EVENT_NAMES.error || eventName === BINARY_TRANSPORT_EVENT_NAMES.type) {
      this._lastEvent = eventName
      this._stateHandler(eventName, detail)
    }
    else if (this._lastEvent !== eventName) {
      this._lastEvent = eventName
      this._stateHandler(eventName)
      if (eventName === BINARY_TRANSPORT_EVENT_NAMES.close) {
        this._whenReadyController.resolve(false)
      }
    }
  }

  protected _open (): void {
    if (!this._enabled) {
      return
    }
    if (this._socket) {
      this._close(false)
    }
    else {
      clearTimeout(this._reconnectTid)
    }
    this._retries++
    try {
      this._socket = new WebSocket(this._url, this._protocols as undefined)
      this._socket.binaryType = this._binaryType
      this._socket.addEventListener('open', this._onOpen, { once: true })
      this._socket.addEventListener('message', this._onMessage)
      this._socket.addEventListener('close', this._onClose, { once: true })
      this._socket.addEventListener('error', this._onError)
    } catch (e) {
      const detail = errorDetails.ConnectionError(undefined, e)
      detail.url = this._url
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.error, new ConnectionError(detail))
      this._close(false)
      this._reconnect()
    }
  }

  protected _reconnectTid: undefined | ReturnType<typeof setTimeout> = undefined
  protected _reconnect (): void {
    clearTimeout(this._reconnectTid)
    if (this._retries < this._maxRetries) {
      this._reconnectTid = setTimeout(() => this._open(), this._retryDelay(this._retries))
    }
    else {
      this._close(true)
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.close)
    }
  }

  protected _close (force: boolean): void {
    // Очистим reconnect, чтобы не произошло такого: _reconnect() -> connect(false) -> connect(true)
    // при котором повторное соединение может нарваться на незавершенный _reconnect()
    clearTimeout(this._reconnectTid)
    try {
      this._socket?.removeEventListener('open', this._onOpen)
      this._socket?.removeEventListener('message', this._onMessage)
      this._socket?.removeEventListener('close', this._onClose)
      this._socket?.removeEventListener('error', this._onError)
      this._socket?.close()
    } catch (_) { /**/ }
    this._socket = null
    if (force) {
      this._whenReadyController.resolve(false)
    }
  }

  enable (enable: boolean): void {
    if (this._enabled !== enable) {
      this._enabled = enable
      if (enable) {
        this._open()
      }
      else {
        this._close(true)
        this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.close)
      }
    }
  }

  /**
   * Отправить сообщение.
   *
   * Если в результате вызова WebSocket.send() произошла ошибка, функция вызывает обработчика состояния и так же
   * возвращает эту ошибку. В противном случае, метод ничего не возвращает.
   */
  send (data: string | ArrayBufferLike | Blob | ArrayBufferView): undefined | SendError {
    try {
      this._socket!.send(data)
    } catch (e) {
      const detail = errorDetails.SendError(undefined, e)
      detail.url = this._url
      const error = new SendError(detail)
      this._stateEvent(BINARY_TRANSPORT_EVENT_NAMES.error, error)
      return error
    }
    return undefined
  }

  /**
   * Отправить сообщение без подавления ошибки.
   *
   * В отличие от {@link send()} эта функция может завершиться неопределенной ошибкой. Ошибка не оборачивается в
   * собственную {@link SendError} и не отправляется в слушателя. Наиболее вероятно, что при ошибке уже было
   * вызвано событие `error` или `close`, а `sendOrThrow()` вызван непреднамеренно.
   *
   * Этот метод полезен для реализации клиентов которым необходимо зафиксировать неотправленные данные.
   */
  sendOrThrow (data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this._socket!.send(data)
  }

  changeUrl (url: string, protocols?: undefined | null | string | string[] | readonly string[]): void {
    this._url = url
    this._protocols = ensureProtocols(protocols)
  }

  changeReceiveHandler (handler: TWsReceiveHandler<T, UWebSocketMessageTypeOf<T>>): void {
    this._receiveHandler = handler as TWsReceiveHandler
  }

  changeStateHandler (handler: TWsStateHandler): void {
    this._stateHandler = handler
  }

  whenReady (): boolean | Promise<boolean> {
    if (!this._enabled) {
      return false
    }
    if (this.isConnected()) {
      return true
    }
    return this._whenReadyController.charge()
  }
}

export {
  WebSocketConnector
}
