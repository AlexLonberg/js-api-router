import type { TBinaryTransportReceiveHandler, TBinaryTransportStateHandler } from '../interfaces/BinaryTransportLike.js'
import type { WebSocketConnector } from './WebSocketConnector.js'

/**
 * Типы сообщений {@link WebSocket}.
 */
const webSocketMessageTypes = Object.freeze(['arraybuffer', 'blob', 'string'] as const)
/**
 * Типы сообщений {@link WebSocket}.
 */
type TWebSocketMessageType = (typeof webSocketMessageTypes)[number]

type _BinaryTypeMap = {
  string: string
  blob: Blob
  arraybuffer: ArrayBuffer
}
type UWebSocketMessageTypeOf<T extends TWebSocketMessageType> = _BinaryTypeMap[T]

/**
 * Обработчик сообщений {@link WebSocketConnector}.
 */
type TWsReceiveHandler<TType extends 'string' | 'blob' | 'arraybuffer' = 'string' | 'blob' | 'arraybuffer', TData extends string | Blob | ArrayBuffer = string | Blob | ArrayBuffer> = TBinaryTransportReceiveHandler<TType, TData>

/**
 * Обработчик ошибок и состояния подключений {@link WebSocketConnector}.
 */
type TWsStateHandler = TBinaryTransportStateHandler

/**
 * Опциональные параметры WebSocket соединения.
 */
interface TWebSocketConnectorOptions<B extends TWebSocketMessageType> {
  /**
   * MDN [WebSocket protocols](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#protocols)
   */
  protocols?: undefined | null | string | string[] | readonly string[]
  /**
   * Максимальное количество попыток соединения. Значение `< 1` означает бесконечные попытки.
   */
  retries?: undefined | null | number
  /**
   * Интервал повторной попытки соединения при разрыве связи.
   */
  retryDelay?: undefined | null | number | ((attempt: number) => number)
  /**
   * Какой тип данных следует пропускать, а какой считать ошибкой.
   * Параметр можно передать списком, при этом нет смысла указывать два несовместимых типа `'arraybuffer' | 'blob'`.
   * Если параметр не задан, сообщения будет принимать любой параметр,
   * а сокету будет установлен параметр {@link BinaryType} `blob`.
   */
  binaryType?: undefined | null | B | B[] | (readonly B[])
  /**
   * Слушатель сообщений. Первым параметром принимается тип {@link TWebSocketMessageType}, вторым данные соответствующие типу.
   */
  receiveHandler?: undefined | null | (<T extends B> (type: T, data: UWebSocketMessageTypeOf<T>) => any)
  /**
   * Слушатель ошибок и/или соединения. Вызывается при событиях ошибок и неожиданном разрыве соединения.
   * Для успешного соединения и закрытия сокета, функция будет вызвана без параметра ошибки.
   * Событие `'open'` так же вызывается после ошибки, когда клиент не закрывает соединение явно и производится повторная
   * попытка подключения.
   */
  stateHandler?: undefined | null | TWsStateHandler
}

export {
  webSocketMessageTypes,
  type TWebSocketMessageType,
  type UWebSocketMessageTypeOf,
  type TWsReceiveHandler,
  type TWsStateHandler,
  type TWebSocketConnectorOptions
}
