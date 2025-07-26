import type { JsonLike, UMutable, TPositiveInteger } from '../types.js'
import { hasOwn, isArray, isNonemptyString, safeToJson } from '../utils.js'
import { errorDetails, ProtocolError, UnpackError } from '../errors.js'
import { JsonBufferCodec } from '../libs/JsonBufferCodec.js'
import { type TMfpFramerOptions, MfpFramer } from '../mfp/MfpFramer.js'
import {
  MFP_FRAME_TYPES,
  MFP_SERVICE_CODES,
  type TMfpServiceCodes,
  type TMfpMessage,
  type TMfpRequest,
  type TMfpResponse,
  type TMfpBinary,
} from '../mfp/types.js'
import {
  type TMdpFileContainer,
  type TMdpServiceOptions,
  type TMdpRequestOptions,
  type TMdpMessageOptions,
  type TMdpResponseOptions,
  type TMdpAnnounceOptions,
  type TMdpBinaryOptions,
  type TMdpDecodedService,
  type TMdpDecodedData
} from './types.js'

const protoTrueAck = Object.defineProperties({}, {
  type: { enumerable: true, value: MFP_FRAME_TYPES.service },
  code: { enumerable: true, value: MFP_SERVICE_CODES.ack },
  ownRefId: { enumerable: true, value: true },
  ack: { enumerable: true, value: true },
  timeout: { enumerable: true, value: false },
  abort: { enumerable: true, value: false },
  unknown: { enumerable: true, value: false },
  ping: { enumerable: true, value: false },
  checksum: { enumerable: true, value: false },
})

function verifyEndpointName_ (endpoint: any): void {
  if (!isNonemptyString(endpoint)) {
    throw new ProtocolError(errorDetails.ProtocolError(`Имя endpoint:${safeToJson(endpoint)} должно быть непустой строкой.`))
  }
}

/**
 * Разбирает пользовательские файлы в отдельный `Map` и карту файлов.
 *
 * @param target Целевой объект для записи поля `filemap`.
 * @param files  Набор файлов.
 * @returns Возвращает `Map<number, ArrayBuffer>` пригодный для передачи в кодировщик.
 */
function _mdpOutgoingDecomposeFiles (
  target: { filemap?: [number, string, string][] },
  files: Map<number, TMdpFileContainer>
): Map<number, ArrayBuffer> {
  const filemap: [number, string, string][] = []
  const binaries = new Map<number, ArrayBuffer>()
  for (const [key, { name, type, bin }] of files) {
    filemap.push([key, name, type])
    binaries.set(key, bin)
  }
  target.filemap = filemap
  return binaries
}

/**
 * Восстанавливает структуру файлов.
 *
 * **Note:** Структуры восстанавливаются в тот же `binaries:Map` по своим ключам - входящий `Map` нигде не используется
 * и сохранять его нет никакого смысла. Исходное поле `binaries` затирается `null`.
 *
 * Поднимает ошибку, если найдено хотя бы одно несоответствие - несовпадение или дубликаты ключей в `filemap`.
 *
 * @param target   Целевая структура с бинарниками `binaries` на которую следует записать поле `files`.
 * @param binaries Бинарные данные.
 * @param filemap  Карта файлов.
 */
function _mdpIncomingComposeFiles (
  target: { id: number, binaries: Map<number, ArrayBuffer>, files?: Map<number, TMdpFileContainer> },
  filemap: [number, string, string][]
): void {
  if (!isArray(filemap) || target.binaries.size !== filemap.length) {
    throw new UnpackError(errorDetails.UnpackError(`Сообщение id:${target.id} с файлами 'binaries' должно иметь карту 'filemap' с одинаковым количеством элементов.`))
  }
  const keys = new Set()
  const files = target.binaries as unknown as Map<number, TMdpFileContainer>
  for (const item/*[key, name, type]*/ of filemap) {
    if (!isArray(item) || item.length !== 3) {
      throw new UnpackError(errorDetails.UnpackError(`Карта файлов 'filemap' сообщения id:${target.id} должна быть в формате '[number, string, string][]'.`))
    }
    if (keys.has(item[0])) {
      throw new UnpackError(errorDetails.UnpackError(`Карта файлов 'filemap' сообщения id:${target.id} имеет дубликал ключа key:${safeToJson(item[0])}.`))
    }
    keys.add(item[0])
    const bin = target.binaries.get(item[0])
    if (bin) {
      files.set(item[0], { name: item[1], type: item[2], bin })
    }
    else {
      throw new UnpackError(errorDetails.UnpackError(`Не найден файл с ключом key:${safeToJson(item[0])} сообщения id:${target.id}.`))
    }
  }
  target.files = files
  target.binaries = null as any
}

/**
 * Поля протокола MDP. Пакуются и распаковываются в data сообщений MFP.
 */
type _TMdpInternalMessageData = {
  endpoint: string
  data?: JsonLike
  error?: JsonLike
  filemap?: [number, string, string][]
}

/**
 * Опции {@link MdpFramer}.
 *
 * **Note:** Параметры наследуются от {@link TMfpFramerOptions}. Если в опциях установлен экземпляр {@link MfpFramer},
 * все остальные параметры игнорируются.
 */
interface TMdpFramerOptions extends TMfpFramerOptions {
  /**
   * Экземпляр {@link MfpFramer}. Если это поле установлено, то остальные параметры {@link TMfpFramerOptions} игнорируются.
   *
   * **Note:** Ссылка на экземпляр может быть полезна, когда используется общий декодер для всего приложения.
   */
  mfpFramer?: undefined | null | MfpFramer
}

/**
 * Реализация кодера `Multiplex Data Protocol (MDP)` поверх `Multiplex Frame Protocol (MFP)`.
 *
 * Кодер/декодер может применяться как с WebSocket, так и HTTP-запросами.
 */
class MdpFramer {
  protected readonly _codec = new JsonBufferCodec()
  protected readonly _framer: MfpFramer
  protected _idCounter = 0

  constructor(options?: undefined | null | TMdpFramerOptions) {
    this._framer = options?.mfpFramer ?? new MfpFramer(options)
  }

  /**
   * Используйте этот метод, чтобы сформировать `id` если он требуется до упаковки данных.
   * Идентификатор должен использоваться в функциях `encode***WithId`
   */
  nextId (): TPositiveInteger {
    let id = ++this._idCounter
    if (id > 0xFFFF_FFFF) {
      id = 1
    }
    return id as TPositiveInteger
  }

  /**
   * Ссылка на {@link JsonBufferCodec}. Может быть полезна для кодирования Json или Text в бинарный формат, для
   * последующей передачи в файловых контейнерах {@link TMdpFileContainer}.
   */
  get codec (): JsonBufferCodec {
    return this._codec
  }

  get framer (): MfpFramer {
    return this._framer
  }

  protected _encodeService (id: number, code: TMfpServiceCodes['ack' | 'abort' | 'timeout' | 'unknown' | 'ping'], refId: number, ownRefId: boolean, checksum: undefined | null | boolean): ArrayBuffer {
    return this._framer.encodeService({
      code: code,
      id,
      refId,
      ownRefId,
      checksum: !!checksum
    })
  }

  /**
   * Упаковывает сообщение в фрейм типа `service`.
   */
  encodeService (options: TMdpServiceOptions): ArrayBuffer {
    return this._encodeService(this.nextId(), options.code, options.refId, options.ownRefId, options.checksum)
  }

  /**
   * Упаковывает сообщение в фрейм типа `service` с флагом `ack`.
   */
  encodeServiceAck (options: Omit<TMdpServiceOptions, 'code'>): ArrayBuffer {
    return this._encodeService(this.nextId(), MFP_SERVICE_CODES.ack, options.refId, options.ownRefId, options.checksum)
  }

  /**
   * Упаковывает сообщение в фрейм типа `service` с флагом `code`.
   */
  encodeServiceTimeout (options: Omit<TMdpServiceOptions, 'code'>): ArrayBuffer {
    return this._encodeService(this.nextId(), MFP_SERVICE_CODES.timeout, options.refId, options.ownRefId, options.checksum)
  }

  /**
   * Упаковывает сообщение в фрейм типа `service` с флагом `abort`.
   */
  encodeServiceAbort (options: Omit<TMdpServiceOptions, 'code'>): ArrayBuffer {
    return this._encodeService(this.nextId(), MFP_SERVICE_CODES.abort, options.refId, options.ownRefId, options.checksum)
  }

  /**
   * Упаковывает сообщение в фрейм типа `service` с флагом `unknown`.
   */
  encodeServiceUnknown (options: Omit<TMdpServiceOptions, 'code'>): ArrayBuffer {
    return this._encodeService(this.nextId(), MFP_SERVICE_CODES.unknown, options.refId, options.ownRefId, options.checksum)
  }

  /**
   * Упаковывает сообщение в фрейм типа `service` с флагом `ping`.
   */
  encodeServicePing (checksum?: undefined | null | boolean): ArrayBuffer {
    const id = this.nextId()
    return this._framer.encodeService({
      code: MFP_SERVICE_CODES.ping,
      id,
      refId: id,
      ownRefId: true,
      checksum: !!checksum
    })
  }

  protected _normalizeMessage (id: number, endpoint: string, options: TMdpMessageOptions<any>): Omit<TMfpMessage, 'type'> {
    verifyEndpointName_(endpoint)
    const data: _TMdpInternalMessageData = { endpoint }
    let binaries: null | Map<number, ArrayBuffer> = null
    if (options.data) {
      data.data = options.data
    }
    if (options.error) {
      data.error = options.error
    }
    if (options.files && options.files.size > 0) {
      binaries = _mdpOutgoingDecomposeFiles(data, options.files)
    }
    return {
      id,
      data: this._codec.jsonLikeToBuffer(data),
      binaries,
      expected: null,
      streaming: false,
      needAck: !!options.needAck,
      checksum: !!options.checksum
    }
  }

  /**
   * Упаковывает сообщение с данными и/или файлами в тип `message`.
   *
   * @param endpoint Непустая строка.
   * @param options  Опциональные данные.
   */
  encodeMessage (endpoint: string, options: TMdpMessageOptions<any>): ArrayBuffer {
    return this._framer.encodeMessage(this._normalizeMessage(this.nextId(), endpoint, options))
  }

  protected _normalizeRequest (id: number, endpoint: string, options: TMdpRequestOptions<any>): Omit<TMfpRequest, 'type'> {
    verifyEndpointName_(endpoint)
    const data: _TMdpInternalMessageData = { endpoint }
    let binaries: null | Map<number, ArrayBuffer> = null
    if (options.data) {
      data.data = options.data
    }
    if (options.files && options.files.size > 0) {
      binaries = _mdpOutgoingDecomposeFiles(data, options.files)
    }
    return {
      id,
      data: this._codec.jsonLikeToBuffer(data),
      binaries,
      needAck: !!options.needAck,
      checksum: !!options.checksum
    }
  }

  /**
   * Упаковывает сообщение с данными и/или файлами в тип `request`.
   *
   * @param endpoint Непустая строка.
   * @param options  Опциональные данные.
   */
  encodeRequest (endpoint: string, options: TMdpRequestOptions<any>): ArrayBuffer {
    return this._framer.encodeRequest(this._normalizeRequest(this.nextId(), endpoint, options))
  }

  /**
   * Упаковывает сообщение с данными и/или файлами в тип `response`.
   *
   * @param endpoint Непустая строка.
   * @param options  Опциональные данные.
   */
  encodeResponse (endpoint: string, options: TMdpResponseOptions<any>): ArrayBuffer {
    const data = this._normalizeMessage(this.nextId(), endpoint, options) as Omit<TMfpMessage, 'type'> & { refId: number }
    data.refId = options.refId
    return this._framer.encodeResponse(data)
  }

  protected _normalizeAnnounce (id: number, endpoint: string, options: TMdpAnnounceOptions<any>): Omit<TMfpMessage, 'type'> {
    verifyEndpointName_(endpoint)
    const data: _TMdpInternalMessageData = { endpoint }
    if (options.data) {
      data.data = options.data
    }
    const expected: null | Set<number> = (options.expected && options.expected.size > 0) ? options.expected : null
    return {
      id,
      data: this._codec.jsonLikeToBuffer(data),
      binaries: null,
      expected,
      streaming: !expected,
      needAck: !!options.needAck,
      checksum: !!options.checksum
    }
  }

  /**
   * Упаковывает сообщение с данными и/или анонсированным списком файлов в тип `message`.
   *
   * @param endpoint Непустая строка.
   * @param options  Опциональные данные.
   */
  encodeAnnounce (endpoint: string, options: TMdpAnnounceOptions<any>): ArrayBuffer {
    return this._framer.encodeMessage(this._normalizeAnnounce(this.nextId(), endpoint, options))
  }

  protected _normalizeBinary (id: number, options: TMdpBinaryOptions): Omit<TMfpBinary, 'type'> {
    return {
      id,
      refId: options.refId,
      hasExpected: !!options.hasExpected,
      hasStreaming: !!options.hasStreaming,
      hasData: !!options.hasData,
      key: options.key ?? -1,
      bin: options.bin ?? null,
      final: !!options.final,
      needAck: !!options.needAck,
      checksum: !!options.checksum
    }
  }

  /**
   * Упаковывает сообщение с данными и/или файлами в тип `request`.
   *
   * @param endpoint Непустая строка.
   * @param options  Опциональные данные.
   */
  encodeBinary (options: TMdpBinaryOptions): ArrayBuffer {
    return this._framer.encodeBinary(this._normalizeBinary(this.nextId(), options))
  }

  encodeServiceWithId (id: number, options: TMdpServiceOptions): ArrayBuffer {
    return this._encodeService(id, options.code, options.refId, options.ownRefId, options.checksum)
  }

  encodeMessageWithId (id: number, endpoint: string, options: TMdpMessageOptions<any>): ArrayBuffer {
    return this._framer.encodeMessage(this._normalizeMessage(id, endpoint, options))
  }

  encodeRequestWithId (id: number, endpoint: string, options: TMdpRequestOptions<any>): ArrayBuffer {
    return this._framer.encodeRequest(this._normalizeRequest(id, endpoint, options))
  }

  encodeResponseWithId (id: number, endpoint: string, options: TMdpResponseOptions<any>): ArrayBuffer {
    const data = this._normalizeMessage(id, endpoint, options) as Omit<TMfpMessage, 'type'> & { refId: number }
    data.refId = options.refId
    return this._framer.encodeResponse(data)
  }

  encodeAnnounceWithId (id: number, endpoint: string, options: TMdpAnnounceOptions<any>): ArrayBuffer {
    return this._framer.encodeMessage(this._normalizeAnnounce(id, endpoint, options))
  }

  encodeBinaryWithId (id: number, options: TMdpBinaryOptions): ArrayBuffer {
    return this._framer.encodeBinary(this._normalizeBinary(id, options))
  }

  protected _unpack (message: UMutable<TMfpMessage | TMfpRequest | TMfpResponse> & { endpoint: string, data: null | JsonLike, files: null | Map<number, TMdpFileContainer>, error: null | JsonLike }): void {
    const packet = this._codec.bufferToJsonLike(message.data!) as { endpoint: string, data: any, error: any, filemap: [number, string, string][] }
    if (!isNonemptyString(packet.endpoint)) {
      throw new UnpackError(errorDetails.UnpackError(`Сообщение id:${message.id} не имеет обязательного поля 'endpoint:string'.`))
    }
    message.endpoint = packet.endpoint
    // перезаписываем на это поле пользовательские данные
    message.data = packet.data ?? null
    // У сообщений request не должно быть поля error
    if (message.type !== MFP_FRAME_TYPES.request) {
      message.error = hasOwn(packet, 'error') ? packet.error : null
    }
    if (message.binaries) {
      _mdpIncomingComposeFiles(
        // @ts-expect-error
        message,
        packet.filemap)
    }
    else {
      message.files = null
    }
  }

  /**
   * Декодирует сообщение в один из допустимых типов.
   *
   * @param buffer Полученное сообщение.
   */
  decode (buffer: ArrayBuffer): TMdpDecodedData {
    const message = this._framer.decode(buffer)
    if (message.type === MFP_FRAME_TYPES.request || message.type === MFP_FRAME_TYPES.response || message.type === MFP_FRAME_TYPES.message) {
      // Поля в сообщении
      //  message.type
      //  message.id
      //  message.data     <- раскрывается
      //  message.binaries
      //  message.expected
      //  message.streaming
      //  message.needAck
      //  message.checksum
      //  message.files    <- нет. могут быть в data.filemap
      //  message.endpoint <- нет. Записано в data
      //  message.error    <- нет. Записано в data
      // Поля type/id/expected/streaming/needAck/checksum - уже есть в message
      // Поле data+binaries раскрывается в endpoint/data/files/error
      // Поле binaries - затирается null
      // @ts-expect-error
      this._unpack(message)
      // @ts-expect-error Структурура будет обновлена до необходимого типа
      return message
    }
    // Сообщения TMfpBinary и TMfpService не нуждаются распаковке
    return message
  }

  /**
   * Создает заглушку {@link TMdpDecodedService} с собственными `id/refId` для автоматической установки значения
   * пригодного для замены реального сервисного сообщения подтверждения.
   *
   * **Note:** Заглушка используется для запросов которым требуется вернуть структуру, но у которых не установлен `needAck`
   *
   * @param id `id` запроса.
   */
  decodedServiceSelfAck (id: number): TMdpDecodedService {
    return Object.create(protoTrueAck, {
      id: { enumerable: true, value: id },
      refId: { enumerable: true, value: id }
    })
  }
}

export {
  verifyEndpointName_,
  type TMdpFramerOptions,
  MdpFramer
}
