import type { RawData, WebSocket } from 'ws'
import { DataTypeError, errorDetails, ConnectionError } from '../errors.js'
import {
  type TBinaryTransportReceiveHandler,
  type TBinaryTransportStateHandler,
  BINARY_TRANSPORT_EVENT_NAMES,
  BinaryTransportLike
} from '../interfaces/BinaryTransportLike.js'
import { nodeBufferToArrayBuffer } from './utils.js'

/**
 * Обертка над сокетом `import { WebSocket } from 'ws'` делающим его похожим на клиентский WebSocket
 */
class WebSocketWrapper extends BinaryTransportLike<ArrayBuffer, ArrayBuffer> {
  readonly isEnabled = () => true
  readonly isConnected = () => true

  private readonly _ws: WebSocket
  private _receiveHandler!: TBinaryTransportReceiveHandler<string, ArrayBuffer>
  private _stateHandler!: TBinaryTransportStateHandler

  protected readonly _onError = (e: any) => {
    this._stateHandler(BINARY_TRANSPORT_EVENT_NAMES.error, new ConnectionError(errorDetails.ConnectionError('Node WS Error', e)))
  }

  protected readonly _onReceive = (rawData: RawData, isBinary: boolean) => {
    if (isBinary) {
      try {
        const data = nodeBufferToArrayBuffer(rawData)
        this._receiveHandler('arraybuffer', data)
        return
      } catch (e) { /**/ }
    }
    this._stateHandler(BINARY_TRANSPORT_EVENT_NAMES.type, new DataTypeError(errorDetails.DataTypeError('Ошибка типа входящего сообщения')))
  }

  constructor(ws: WebSocket) {
    super()
    this._ws = ws
    ws.on('error', this._onError)
    ws.on('message', this._onReceive)
  }

  get url (): string {
    return this._ws.url ?? ''
  }

  sendOrThrow (data: ArrayBuffer): void {
    this._ws.send(data)
  }

  changeReceiveHandler (handler: TBinaryTransportReceiveHandler<string, ArrayBuffer>): void {
    this._receiveHandler = handler
  }

  changeStateHandler (handler: TBinaryTransportStateHandler): void {
    this._stateHandler = handler
  }

  send (_data: ArrayBuffer): undefined {
    // ...
  }

  enable (_enable: boolean): void {
    // ...
  }
}

export {
  WebSocketWrapper
}
