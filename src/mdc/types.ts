import {
  interfaceDefineHasInstanceMarker,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type interfaceImplements
} from 'ts-interface-core'
import type { JsonLike, UOptional, TPositiveInteger, TNonemptyString, TResponse } from '../types.js'
import type { ApiRouterError } from '../errors.js'
import type { BinaryTransportLike } from '../interfaces/BinaryTransportLike.js'
import type { TWebSocketConnectorOptions } from '../ws/types.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { WebSocketConnector } from '../ws/WebSocketConnector.js'
import type {
  TMfpFramerOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MfpFramer
} from '../mfp/MfpFramer.js'
import type {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TMdpMessageBaseOptions,
  TMdpMessageOptions,
  TMdpDecodedService,
  TMdpDecodedMessage,
  TMdpDecodedBinary,
  TMdpDecodedRequest,
  TMdpDecodedResponse,
  TMdpDecodedData
} from '../mdp/types.js'
import type { MdpFramer } from '../mdp/MdpFramer.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MdpEndpoint } from './MdpEndpoint.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MdpEndpointDispatcher } from './MdpEndpointDispatcher.js'

type TMdpTimeoutOptions = {
  /**
   * Максимальное время запроса, включая подтверждение `needAck`.
   *
   * Если этот параметр не установлен, используется значение по умолчанию.
   */
  timeout?: undefined | null | number
  /**
   * Пользовательский `AbortSignal` которым можно прервать запрос.
   */
  abortSignal?: undefined | null | AbortSignal
}

/**
 * События соединения и клиента.
 */
const MDP_ENDPOINT_EVENT_CODES = Object.freeze({
  /**
   * Зарезервировано.
   */
  none: 0,
  /**
   * Входящее сообщение.
   */
  message: 1,
  /**
   * Входящий запрос.
   */
  request: 2,
  /**
   * Входящий файл, который должен быть приложен к ранее анонсированному сообщению по `refId`.
   */
  binary: 3,
  /**
   * Любой тип сообщения для которого не найдено связанное сообщение.
   *
   * Примером такого сообщения может быть ответ {@link TMdpDecodedResponse} на запрос `request` с `refId`
   * отсутствующим в ожидающих контекстах.
   *
   * Зарезервированные и деактивированные `endpoint` {@link MdpEndpoint} не получают адресованных им сообщений и
   * последние попадают в общий обработчик соединения.
   */
  unknown: 4,
  /**
   * Входящее сообщение которое не удалось распаковать. К событию прикладывается ошибка.
   */
  unpack: 5,
  /**
   * Внутренняя ошибка кодирования сообщения.
   *
   * Ошибки упаковки возвращаются из функций запросов и контекстов. Эта ошибка отслеживает, недоступную пользователю,
   * автоматическую генерацию сервисных сообщений. Такая ошибка, скорее всего, никогда не произойдет.
   */
  pack: 6,
  /**
   * Событие соединения. Соединение открыто и доступно.
   */
  open: 7,
  /**
   * Соединение было закрыто. Требуется переподключение. Если соединение закрыто по ошибке, к событию прикладывается ошибка.
   */
  close: 8,
  /**
   * Соединение вызвало ошибку. Требуется ожидание или переподключение. К событию прикладывается ошибка.
   */
  error: 9,
  /**
   * Событие активации/деактивации {@link MdpEndpoint}.
   */
  enable: 10
})
/**
 * События соединения и клиента.
 */
type TMdpEndpointEventCodes = typeof MDP_ENDPOINT_EVENT_CODES
/**
 * События соединения и клиента.
 */
type TMdpEndpointEventCode = TMdpEndpointEventCodes[keyof TMdpEndpointEventCodes]

/**
 * Коды завершения контекста.
 */
const MDP_ENDPOINT_CONTEXT_STATUS_CODES = Object.freeze({
  /**
   * Отсутствие статуса(начальное состояние).
   */
  none: 0,
  /**
   * Успешное завершение.
   */
  complete: 1,
  /**
   * Завершение по `abort`.
   */
  abort: 2,
  /**
   * Завершение по `timeout`.
   */
  timeout: 3,
  /**
   * Ошибка упаковки. Сообщения не было отправлено.
   */
  pack: 4,
  /**
   * Ошибка соединения. Сообщение не было отправлено.
   */
  error: 5,
  /**
   * Логическая ошибка, при которой контекст уничтожается.
   *
   * Примером такой ошибки может быть сообщение адресованное установленному идентификатору контекста `ping`, но
   * сообщение имеет неожидаемый код или формат.
   */
  logic: 6
})
/**
 * Коды завершения контекста.
 */
type TMdpEndpointConextStatusCodes = typeof MDP_ENDPOINT_CONTEXT_STATUS_CODES
/**
 * Коды завершения контекста.
 */
type TMdpEndpointConextStatusCode = TMdpEndpointConextStatusCodes[keyof TMdpEndpointConextStatusCodes]

/**
 * Функция обработчик входящих сообщений, запросов или ошибок.
 * Первый параметр функции принимает один из кодов {@link MDP_ENDPOINT_EVENT_CODES}.
 */
interface TMdpEndpointHandler<T extends JsonLike = JsonLike> {
  /**
   * Обычное сообщение.
   */
  (type: TMdpEndpointEventCodes['message'], value: TMdpDecodedMessage<T>): any
  /**
   * Контекст запроса. Сообщение запроса доступно из контекста.
   */
  (type: TMdpEndpointEventCodes['request'], value: MdpEndpointRequestContextLike): any
  /**
   * Бинарный файл приложенный к анонсированному сообщению.
   */
  (type: TMdpEndpointEventCodes['binary'], value: TMdpDecodedBinary): any
  /**
   * Состояние соединения. Соединение открыто и доступно. Второй параметр следует игнорировать.
   */
  (type: TMdpEndpointEventCodes['open'], value: any): any
  /**
   * Соединение было закрыто. Требуется переподключение. К событию прикладывается ошибка, если соединение закрыто по ошибке.
   */
  (type: TMdpEndpointEventCodes['close'], value?: undefined | null | ApiRouterError): any
  /**
   * Соединение вызвало ошибку. Требуется ожидание или переподключение. К событию прикладывается ошибка.
   */
  (type: TMdpEndpointEventCodes['error'], value: ApiRouterError): any
  /**
   * Событие активации/деактивации резервированного `endpoint`.
   */
  (type: TMdpEndpointEventCodes['enable'], value: boolean): any
  (type: TMdpEndpointEventCodes['message' | 'request' | 'binary' | 'open' | 'close' | 'error' | 'enable'], value: any): any
}

/**
 * Общий обработчик сообщений и ошибок, которые не передаются в выделенные `endpoint`.
 */
interface TMdpDispatcherHandler<T extends JsonLike = JsonLike> extends TMdpEndpointHandler<T> {
  /**
   * Любое сообщение для которого требуется адресат, но последний не обнаружен или деактивирован.
   */
  (type: TMdpEndpointEventCodes['unknown'], value: TMdpDecodedData): any
  /**
   * Ошибка декодирования. Это может быть как ошибка фрейма сообщения, так и неверный формат Json.
   * Ошибка с кодом `pack`, скорее всего, никогда не произойдет.
   */
  (type: TMdpEndpointEventCodes['unpack' | 'pack'], value: ApiRouterError): any
  (type: TMdpEndpointEventCodes['message' | 'request' | 'binary' | 'open' | 'close' | 'error' | 'enable' | 'unknown' | 'unpack' | 'pack'], value: any): any
}

interface TMdpEndpointReadonlyOptions {
  /**
   * Максимальное время ожидания ответа на запрос. По умолчанию `0` - без ограничений.
   *
   * Работает в обе стороны:
   *
   *  + Если отправитель создал запрос, на который вовремя не получен ответ, контекст уничтожается с ошибкой.
   *  + Если получатель не вернул в контекст ответ адресованный отправителю, контекст уничтожается с ошибкой.
   *
   * Для любого сообщения этот параметр можно менять в опциях запроса {@link TMdpTimeoutOptions.timeout}.
   */
  readonly timeout: 0 | number
  /**
   * Максимальное время жизни контекста ожидающего подтверждения. По умолчанию `0` - без ограничений.
   *
   * **Note:** Актуально только для контекстов с простым сообщением `message`, `binary` и служебного `ping`.
   * Время жизни остальных контекстов определено соответствующими опциями.
   *
   * Этот параметр можно менять в опциях запроса {@link TMdpTimeoutOptions.timeout}.
   */
  readonly timeoutAck: 0 | number
  /**
   * Автоматическая установка всем сообщениям и запросам флага требующего подтверждения. По умолчанию `false`.
   *
   * Этот параметр можно менять в опциях запроса {@link TMdpMessageBaseOptions.needAck}.
   */
  readonly needAck: boolean
  /**
   * Автоматическая установка всем сообщениям флага верификации(контрольная сумма). По умолчанию `false`.
   *
   * Этот параметр можно менять в опциях запроса {@link TMdpMessageBaseOptions.checksum}.
   *
   * **Warning:** Этот параметр имеет эффект если {@link TMdpDispatcherOptions.checksumVerification} установлен в `1`,
   * иначе он будет проигнорирован внутри {@link MfpFramer}.
   */
  readonly checksum: boolean
}

/**
 * Нормализованные параметры {@link MdpEndpointDispatcher}.
 */
interface TMdpEndpointDispatcherReadonlyOptions extends TMdpEndpointReadonlyOptions {
  /**
   * Автоматическая установка сервисным сообщениям флага верификации(контрольная сумма). По умолчанию `false`.
   *
   * Что считается сервисными сообщениями?:
   *
   *  + Сообщения подтверждений недоступные пользователю, возвращаемые на запросы с полем `needAck`.
   *  + Сообщения прерываний `timeout/abort`, которые будут возвращены инициатору запроса, когда срабатывает одно из
   *    условий или явно вызываются функции контекста `abort()/timeout()`.
   *  + Вызов функции `ping()`.
   *
   * **Warning:** Этот параметр имеет эффект если {@link TMdpDispatcherOptions.checksumVerification} установлен в `1`,
   * иначе он будет проигнорирован внутри {@link MfpFramer}.
   */
  readonly checksumService: boolean
  /**
   * Автоматическая отправка сервисного сообщения с кодом `abort` для запросов адресованных выделенным отключенным
   * {@link MdpEndpoint.enabled} `=== false` `endpoint`.
   */
  readonly autoAbort: boolean
  /**
   * Резервная конечная точка {@link MdpEndpoint} для которой передаются сообщения с бинарными файлами.
   *
   * Если конечная точка не выделена или не включена, файлы будут передаваться общему обработчику {@link MdpEndpointDispatcher}.
   *
   * **Note:** Сообщения типа `binary` не имеют полей и не могут быть привязаны к какому либо выделенному `endpoint`.
   * В том числе, для них нет контекста. Идентифицировать такие файлы можно только по связке анонсированного сообщения
   * для которого передан файл с полем `refId`.
   */
  readonly reservedBinaryEndpoint: null | string
}

/**
 * Опциональные параметры {@link MdpEndpointDispatcher}.
 */
interface TMdpDispatcherOptions extends
  UOptional<Omit<TMdpEndpointDispatcherReadonlyOptions, 'autoAbort'>>,
  Pick<TWebSocketConnectorOptions<'arraybuffer'>, 'protocols' | 'retries' | 'retryDelay'>,
  TMfpFramerOptions {
  /**
   * Автоматический возврат сервисных сообщений с кодом `abort`. По умолчанию сообщения отправляются `noAutoAbort:false`.
   *
   * По умолчанию, если запросы(или сообщения streaming:true/expected:Set) адресованы выделенным `endpoint` и последние
   * отключены {@link MdpEndpoint.enabled} `=== false`, диспетчер автоматически возвращает сервисное сообщение
   * с кодом `abort`. Такое поведение информирует инициатора запроса о неготовности взаимодействия.
   *
   * Если нужно запретить автоматическую генерацию сервисного сообщения установите `true`. Независимо от этой опции,
   * такие сообщения будут возвращены обработчику с кодом `unknown` без создания контекста.
   */
  noAutoAbort?: undefined | null | boolean
  /**
   * URL адрес соединения.
   *
   * Если параметрам явно установлен {@link connector} это поле не применяется, но будет полезно для отладки.
   */
  url: string
  /**
   * Совместимый с {@link BinaryTransportLike} транспорт, который принимает и получает данные в `ArrayBuffer`.
   *
   * Если параметр не установлен, будет создан {@link WebSocketConnector} с указанным {@link url}.
   * В противном случае параметры {@link protocols}, {@link retryDelay} и {@link retryDelay} игнорируются.
   *
   * **Warning:** Вы не можете использовать собственных обработчиков внутри {@link BinaryTransportLike}. Внутренний
   * механизм {@link MdpEndpointDispatcher} устанавливает свои обработчики и проксирует события.
   */
  connector?: undefined | null | BinaryTransportLike<ArrayBuffer, ArrayBuffer>
  /**
   * Экземпляр {@link MdpFramer}. Если это поле установлено, то все опции {@link TMfpFramerOptions} игнорируются.
   * Иначе будет создан инстанс {@link MdpFramer} с соответствующими опциями.
   */
  mdpFramer?: undefined | null | MdpFramer
  /**
   * Обработчик входящих сообщений и ошибок.
   *
   * Обязателен для {@link MdpEndpointDispatcher}, но можно установить/обновить через {@link MdpEndpointDispatcher.changeHandler()}.
   */
  handler?: undefined | null | TMdpDispatcherHandler<any>
}

/**
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class MdpEndpointContextLike<TResult extends (TMdpDecodedService | TMdpDecodedResponse)> {
  /**
   * Уникальный идентификатор с которым связано сообщение.
   *
   *  + Для инициатора запроса это `id` сообщения.
   *  + Для получателя это `id` отправителя.
   */
  abstract readonly id: TPositiveInteger
  /**
   * Конечная точка к которой привязан контекст.
   */
  abstract readonly endpoint: TNonemptyString
  /**
   * Статут. Если ненулевой, значит контекст завершен.
   */
  abstract readonly status: TMdpEndpointConextStatusCode
  /**
   * Успех или ошибка. Актуально после {@link isFinished()}, в начале всегда `false`.
   */
  abstract readonly ok: boolean
  /**
   * Результат операции. Актуально после {@link isFinished()}, в начале всегда `null`.
   */
  abstract readonly value: null | TResult
  /**
   * Ошибка, если операция обмена сообщениями завершилась неудачно. Актуально после {@link isFinished()}, в начале всегда `null`.
   */
  abstract readonly error: null | ApiRouterError
  /**
   * Контекст завершен в результате успешной операции обмена сообщениями или ошибки.
   *
   * **Важно:** Для контекстов подразумевающих вызовы методов следует проверить актуальность и, возможно, поле ошибки.
   *            При создании контекста и мгновенного обращения к сокету может произойти ошибка, которая будет тут же
   *            доступна в поле {@link error}.
   */
  abstract isFinished (): boolean
  /**
   * Завершить ожидание, связанные запросы и отправить ошибку `abort`.
   *
   * Вызовы любых методов после `abort()` не имеют эффекта и возвращают последнее состояние.
   */
  abstract abort (): void
  /**
   * Завершить ожидание, связанные запросы и отправить ошибку `timeout`.
   *
   * Вызовы любых методов после `timeout()` не имеют эффекта и возвращают последнее состояние.
   */
  abstract timeout (): void
  /**
   * Интерпретация для разных контекстов:
   *
   *  + Исходящие контексты `ping|message|response|binary` - Результат подтверждения `needAck` на стороне получателя сообщения.
   *  + Входящий контекст `request` - Актуален после вызова `reply(...)`. Результат вручения ответа.
   *
   * **Note:** Если опция `needAck` не устанавливается, результат `ack` всегда будет `true`.
   */
  abstract ack (): boolean | Promise<boolean>
}
interfaceDefineHasInstanceMarker(MdpEndpointContextLike)

/**
 * Исходящий контекст только с ожиданием подтверждения.
 *
 * Применяется для сообщений: `ping`, `message`, `binary`.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class MdpEndpointAckContextLike extends MdpEndpointContextLike<TMdpDecodedService> {
  // ...
}
interfaceDefineHasInstanceMarker(MdpEndpointAckContextLike)

/**
 * Входящий контекст запроса ожидающий ответа.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class MdpEndpointRequestContextLike extends MdpEndpointContextLike<TMdpDecodedService> {
  /**
   * Входящий запрос.
   */
  abstract message: TMdpDecodedRequest<any>
  /**
   * Идентификатор с которым будет отправлен ответ.
   */
  abstract readonly responseId: TPositiveInteger
  /**
   * Ответ на запрос в том же формате что и простое сообщение {@link MdpEndpoint.message()}.
   * Разрешится с тем же Promise что и {@link ack()}.
   */
  abstract reply (options: TMdpMessageOptions<any> & TMdpTimeoutOptions): TResponse<TMdpDecodedService> | Promise<TResponse<TMdpDecodedService>>
}
interfaceDefineHasInstanceMarker(MdpEndpointRequestContextLike)

/**
 * Исходящий контекст запроса. Разрешается с ответом на запрос.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class MdpEndpointResponseContextLike<T extends JsonLike = JsonLike> extends MdpEndpointContextLike<TMdpDecodedResponse<T>> {
  /**
   * Разрешается с ответом.
   *
   * **Note:** Резальтат запроса с опцией `needAck` доступен через {@link ack()}.
   */
  abstract result (): TResponse<TMdpDecodedResponse<T>> | Promise<TResponse<TMdpDecodedResponse<T>>>
}
interfaceDefineHasInstanceMarker(MdpEndpointResponseContextLike)

export {
  type TMdpTimeoutOptions,
  MDP_ENDPOINT_EVENT_CODES,
  type TMdpEndpointEventCodes,
  type TMdpEndpointEventCode,
  MDP_ENDPOINT_CONTEXT_STATUS_CODES,
  type TMdpEndpointConextStatusCodes,
  type TMdpEndpointConextStatusCode,
  type TMdpEndpointHandler,
  type TMdpDispatcherHandler,
  type TMdpEndpointReadonlyOptions,
  type TMdpEndpointDispatcherReadonlyOptions,
  type TMdpDispatcherOptions,
  MdpEndpointContextLike,
  MdpEndpointAckContextLike,
  MdpEndpointRequestContextLike,
  MdpEndpointResponseContextLike
}
