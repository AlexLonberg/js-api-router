import type { JsonLike } from '../types.js'
import type { TMfpFrameTypes, TMfpFrameType, TMfpServiceCodes, TMfpService, TMfpBinary } from '../mfp/types.js'

/**
 * Контейнер для файлов или других бинарных данных.
 */
type TMdpFileContainer = {
  /**
   * Имя файла.
   */
  name: string
  /**
   * Тип файла. Это может быть `mime` или любая строка полезная для получателя.
   */
  type: string
  /**
   * Файл в виде необработанного буфера.
   */
  bin: ArrayBuffer
}

interface TMdpServiceOptions {
  code: TMfpServiceCodes['ack' | 'abort' | 'timeout' | 'unknown' | 'ping']
  refId: number
  ownRefId: boolean
  checksum?: undefined | null | boolean
}

/**
 * Базовые опции применимые к любому сообщению.
 */
interface TMdpMessageBaseOptions {
  /**
   * Следует ли вернуть подтверждение о получении сообщения.
   */
  needAck?: undefined | null | boolean
  /**
   * Приложить ли к сообщению контрольную сумму.
   */
  checksum?: undefined | null | boolean
}

/**
 * Опциональные параметры запроса.
 */
interface TMdpRequestOptions<T extends JsonLike = JsonLike> extends TMdpMessageBaseOptions {
  /**
   * Необязательные данные. Любой {@link JsonLike} тип.
   */
  data?: undefined | null | T
  /**
   * Необязательные приложенные файлы.
   */
  files?: undefined | null | Map<number, TMdpFileContainer>
}

/**
 * Опциональные параметры простого сообщения.
 */
interface TMdpMessageOptions<T extends JsonLike = JsonLike> extends TMdpRequestOptions<T> {
  /**
   * Это поле может быть использовано по аналогии с HTTP ошибками.
   */
  error?: undefined | null | JsonLike
}

/**
 * Опциональные параметры ответа на запрос.
 */
interface TMdpResponseOptions<T extends JsonLike = JsonLike> extends TMdpMessageOptions<T> {
  /**
   * Идентификатор запроса.
   */
  refId: number
}

/**
 * Опциональные параметры сообщения с анонсированными файлами или для потоковой передачи файлов.
 */
interface TMdpAnnounceOptions<T extends JsonLike = JsonLike> extends TMdpMessageBaseOptions {
  /**
   * Необязательные данные. Любой {@link JsonLike} тип.
   */
  data?: undefined | null | T
  /**
   * Необязательный набор ключей файлов, который отправитель обязуется передать в следующих сообщениях.
   * Если ключи отсутствуют или `Set` пуст, сообщению устанавливается флаг `streaming`.
   */
  expected?: undefined | null | Set<number>
}

/**
 * Сообщение с бинарными необработанными данными.
 */
interface TMdpBinaryOptions extends TMdpMessageBaseOptions {
  /**
   * Обязательный идентификатор анонсированного сообщения к которому прилагается файл.
   */
  refId: number
  /**
   * Устанавливается, если предварительное сообщение определено с {@link TMdpAnnounceOptions.expected}.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  hasExpected?: undefined | null | boolean
  /**
   * Устанавливается, если предварительное сообщение определено без флага {@link TMdpAnnounceOptions.expected}.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  hasStreaming?: undefined | null | boolean
  /**
   * Устанавливается, если отправитель не привязывает это сообщение к файлам. Такое сообщение может оцениваться как
   * данные и, например, передавать ошибку в последнем сообщение. Реализация протокола может использовать этот подтип
   * как в обычном сообщении для json-данных.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  hasData?: undefined | null | boolean
  /**
   * Уникальный ключ файла. Обязателен, если есть {@link bin}.
   *
   * Если ранее было отправлено сообщение с анонсированными ключами {@link TMdpAnnounceOptions.expected},
   * Ключи должны строго совпадать с ожидаемыми.
   */
  key?: undefined | null | number
  /**
   * Файл в виде необработанного буфера. Если это поле установлено, обязательно должно быть одно из полей
   * `hasExpected/hasStreaming/hasData`.
   */
  bin?: undefined | null | ArrayBuffer
  /**
   * Является ли это сообщение последним.
   */
  final?: undefined | null | boolean
}

/**
 * Базовые декодированные параметры применимые ко всем входящим сообщениям.
 */
interface TMdpDecodedBase {
  /**
   * Один из допустимых типов сообщения.
   */
  readonly type: TMfpFrameType
  /**
   * Идентификатор сообщения.
   */
  readonly id: number
  /**
   * Конечная точка которой адресован запрос.
   */
  readonly endpoint: string
  /**
   * Была ли к запросу приложена контрольная сумма. Только для справки.
   */
  readonly checksum: boolean
}

interface TMdpDecodedPartData<T extends JsonLike = JsonLike> {
  /**
   * Данные которые будут преобразованы к `JsonLike` объекту.
   */
  readonly data: null | T
}

interface TMdpDecodedPartFiles {
  /**
   * Файлы.
   * Поле `files:Map` исключает поля {@link TMdpDecodedMessage.expected} и {@link TMdpDecodedMessage.streaming}.
   */
  readonly files: null | Map<number, TMdpFileContainer>
}

interface TMdpDecodedPartError {
  /**
   * Необязательная ошибка по аналогии с ошибками HTTP-запросов. Формат данных должен быть `JsonLike`.
   */
  readonly error: null | JsonLike
}

interface TMdpDecodedPartRefId {
  /**
   * Идентификатор первоначаного запроса/сообщения которому адресовано это сообщение.
   */
  readonly refId: number
}

interface TMdpDecodedPartNeedAck {
  /**
   * Было ли это сообщение отправлено с флагом запроса подтверждения.
   */
  readonly needAck: boolean
}

/**
 * Декодированное сервисное сообщение.
 *
 * **Note:** Каждый из булевых параметров этого сообщения является взаимоисключающим. Попросту говоря: может быть только один.
 */
type TMdpDecodedService = TMfpService

/**
 * Декодированное сообщение.
 *
 * **Note:** Наличие данных в `files/expected/streaming` являются взаимоисключающими.
 */
interface TMdpDecodedMessage<T extends JsonLike = JsonLike> extends
  TMdpDecodedBase,
  TMdpDecodedPartData<T>,
  TMdpDecodedPartFiles,
  TMdpDecodedPartError,
  TMdpDecodedPartNeedAck {
  readonly type: TMfpFrameTypes['message']
  /**
   * Ключи анонсированных файлов, которые придут в следующих сообщениях {@link TMdpDecodedBinary}.
   *
   * Поле `expected:Set` не может быть определено одновременно с {@link files} или {@link streaming}.
   */
  readonly expected: null | Set<number>
  /**
   * К этому сообщению ожидается неограниченное количество файлов в сообщениях {@link TMdpDecodedBinary}.
   *
   * Поле `streaming:true` не может быть определено одновременно с {@link files} или {@link expected}.
   */
  readonly streaming: null | boolean
}

/**
 * Декодированный фрейм с необработанным файлом.
 *
 * **Note:** Сообщение с отсутствующим файлом является действительным и может иметь только один флаг `final:true`.
 */
type TMdpDecodedBinary = TMfpBinary

/**
 * Декодированное сообщение запроса ожидающее ответ.
 */
interface TMdpDecodedRequest<T extends JsonLike = JsonLike> extends
  TMdpDecodedBase,
  TMdpDecodedPartData<T>,
  TMdpDecodedPartFiles,
  TMdpDecodedPartNeedAck {
  readonly type: TMfpFrameTypes['request']
}

/**
 * Декодированное сообщение ответа на ранее поступивший запрос.
 */
interface TMdpDecodedResponse<T extends JsonLike = JsonLike> extends
  TMdpDecodedBase,
  TMdpDecodedPartData<T>,
  TMdpDecodedPartFiles,
  TMdpDecodedPartError,
  TMdpDecodedPartRefId,
  TMdpDecodedPartNeedAck {
  readonly type: TMfpFrameTypes['response']
}

type TMdpDecodedData =
  TMdpDecodedService |
  TMdpDecodedMessage<any> |
  TMdpDecodedBinary |
  TMdpDecodedRequest<any> |
  TMdpDecodedResponse<any>

export {
  type TMdpFileContainer,
  type TMdpServiceOptions,
  type TMdpMessageBaseOptions,
  type TMdpRequestOptions,
  type TMdpMessageOptions,
  type TMdpResponseOptions,
  type TMdpAnnounceOptions,
  type TMdpBinaryOptions,
  type TMdpDecodedBase,
  type TMdpDecodedPartData,
  type TMdpDecodedPartFiles,
  type TMdpDecodedPartError,
  type TMdpDecodedPartRefId,
  type TMdpDecodedPartNeedAck,
  type TMdpDecodedService,
  type TMdpDecodedMessage,
  type TMdpDecodedBinary,
  type TMdpDecodedRequest,
  type TMdpDecodedResponse,
  type TMdpDecodedData
}
