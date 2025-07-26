import { type interfaceImplements, interfaceDefineHasInstanceMarker } from 'ts-interface-core'
import type { ApiRouterError } from '../errors.js'

const BINARY_TRANSPORT_EVENT_NAMES = Object.freeze({
  open: 1,
  close: 2,
  error: 3,
  type: 4
} as const)
type TBinaryTransportEventNames = typeof BINARY_TRANSPORT_EVENT_NAMES
type TBinaryTransportEventName = TBinaryTransportEventNames[keyof TBinaryTransportEventNames]

/**
 * Слушатель сообщений в допустимых форматах, определенных соединением.
 *
 * Вызов функции гарантирует, что `data` соответствует первому параметру `type`.
 */
interface TBinaryTransportReceiveHandler<TName, TType> {
  (type: TName, data: TType): void
}

/**
 * Слушатель состояния соединения.
 */
interface TBinaryTransportStateHandler {
  (type: TBinaryTransportEventNames['open']): void
  (type: TBinaryTransportEventNames['close'], error?: undefined | null | ApiRouterError): void
  (type: TBinaryTransportEventNames['error'], error: ApiRouterError): void
  (type: TBinaryTransportEventNames['type'], error: ApiRouterError): void
  /**
   * Возможные варианты событий:
   *
   *  + `open`  - Соединение открыто и готово для использования.
   *  + `close` - Соединение закрыто по ошибке или явно. Если соединение закрыто по ошибке, вторым параметром
   *              устанаввливается ошибка, иначе параметр игнорируется. Закрытие по ошибки может предварительно вызвать
   *              событие `error`.
   *  + `error` - Ошибки связанные с соединением.
   *  + `type`  - Недопустимый тип данных. При этом вызов слушателя сообщений игнорируется.
   *
   * @param type Тип события.
   * @param error Ошибка обязательная для типа `error` и `type`.
   */
  (type: TBinaryTransportEventName, error?: undefined | null | ApiRouterError): void
}

/**
 * Интерфейс транспортного протокола, позволяющий отправлять и прослушивать входящие сообщения.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 *
 * @template TData Типы исходящих данных которые принимают `send(TData)` и `sendOrThrow(TData)`.
 * @template TType Тип входящих данных, сопоставленный со строковым `TName`, которой принимает слушатель входящих сообщений.
 * @template TName Строковое описание типа которое принимает слушатель входящих сообщений.
 */
abstract class BinaryTransportLike<TData, TType, TName extends string = string> {
  /**
   * Активирован ли в настоящий момент текущий класс.
   *
   * Это не означает что соединение существует и говорит только о попытке его установить.
   */
  abstract isEnabled (): boolean

  /**
   * Активно ли в настоящий момент соединение и можно ли вызывать методы {@link send()} или {@link sendOrThrow()}.
   */
  abstract isConnected (): boolean

  /**
   * Отправить сообщение.
   *
   * Если в результате вызова произошла ошибка, функция вызывает обработчика состояния и так же возвращает эту ошибку
   * обернутую в {@link ApiRouterError}. В противном случае, метод ничего не возвращает.
   *
   * @param data Допустимый тип данных.
   */
  abstract send (data: TData): undefined | ApiRouterError

  /**
   * Отправить сообщение без подавления ошибки.
   *
   * В отличие от {@link send()} эта функция может завершиться неопределенной ошибкой. Ошибка не оборачивается в
   * собственную {@link ApiRouterError} и не отправляется в слушателя. Наиболее вероятно, что при ошибке уже было
   * вызвано событие `error` или `close`, а `sendOrThrow()` вызван непреднамеренно.
   *
   * Этот метод полезен для реализации клиентов которым необходимо зафиксировать неотправленные данные.
   */
  abstract sendOrThrow (data: TData): void

  /**
   * Активировать или деактивировать соединение.
   *
   * Этот метод не имеет эффекта, если парметр `enable` принимает то же значение что возвращает {@link isEnabled()}.
   */
  abstract enable (enable: boolean): void

  /**
   * Заменить обработчика входящих сообщений.
   */
  abstract changeReceiveHandler (handler: TBinaryTransportReceiveHandler<TName, TType>): void

  /**
   * Заменить обработчика состояния соединения и ошибок.
   */
  abstract changeStateHandler (handler: TBinaryTransportStateHandler): void
}
interfaceDefineHasInstanceMarker(BinaryTransportLike)

export {
  BINARY_TRANSPORT_EVENT_NAMES,
  type TBinaryTransportEventNames,
  type TBinaryTransportEventName,
  type TBinaryTransportReceiveHandler,
  type TBinaryTransportStateHandler,
  BinaryTransportLike
}
