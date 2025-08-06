import { errorDetails, ConfigureError, ProtocolError, FrameEncodeError, FrameDecodeError } from '../errors.js'
import { safeToJson } from '../utils.js'
import { type TPositiveInteger, positiveIntegerOrNull } from '../types.js'
import { type ChecksumVerifierLike, checksumVerifierStub } from '../interfaces/ChecksumVerifierLike.js'
import {
  MFP_FRAME_TYPES,
  type TMfpFrameTypes,
  type TMfpFrameType,
  MFP_SERVICE_CODES,
  type TMfpServiceCodes,
  type TMfpService,
  type TMfpMessage,
  type TMfpRequest,
  type TMfpBinary,
  type TMfpResponse,
  type TMfpDecodedFrame,
  type TMfpDecodedHeader,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type TMfpPartBin,
} from './types.js'

const protoHeader: TMfpDecodedHeader = Object.freeze({
  get code (): number { return (this._headerByte & 0b0111) },
  get hasChecksum (): boolean { return !!(this._headerByte & 0b00010000) },
  get ownRefId (): boolean { return !!(this._headerByte & 0b1000) },
  get needAck (): boolean { return !!(this._headerByte & 0b1000) },
  get hasData (): boolean { return !!(this._headerByte & 0b0001) },
  get hasBinaries (): boolean { return (this._headerByte & 0b0110) === 0b0110 },
  get hasExpected (): boolean { return !!(this._headerByte & 0b0010) },
  get hasStreaming (): boolean { return !!(this._headerByte & 0b0100) }
} as TMfpDecodedHeader & { _headerByte: number })

const protoService: TMfpService = Object.freeze({
  type: MFP_FRAME_TYPES.service as TMfpFrameTypes['service'],
  get ack (): boolean { return this.code === MFP_SERVICE_CODES.ack },
  get timeout (): boolean { return this.code === MFP_SERVICE_CODES.timeout },
  get abort (): boolean { return this.code === MFP_SERVICE_CODES.abort },
  get unknown (): boolean { return this.code === MFP_SERVICE_CODES.unknown },
  get ping (): boolean { return this.code === MFP_SERVICE_CODES.ping },
} as TMfpService & { code: number })

/**
 * Подготовленные типы фреймов - первые три бита сообщения.
 */
const protocolTypesFirst3bit = Object.freeze({
  service: MFP_FRAME_TYPES.service << 5,
  message: MFP_FRAME_TYPES.message << 5,
  request: MFP_FRAME_TYPES.request << 5,
  binary: MFP_FRAME_TYPES.binary << 5,
  response: MFP_FRAME_TYPES.response << 5
} as const)

/**
 * Допустимые коды сервисных сообщений, отправляемых через сеть.
 */
const serviceCodes: ReadonlySet<TMfpServiceCodes['ack' | 'timeout' | 'abort' | 'unknown' | 'ping']> = new Set(
  [
    MFP_SERVICE_CODES.ack,
    MFP_SERVICE_CODES.timeout,
    MFP_SERVICE_CODES.abort,
    MFP_SERVICE_CODES.unknown,
    MFP_SERVICE_CODES.ping
  ]
)

function verifyDecodedProtocolType (type: number): void {
  if (type < 1 || type > 5) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError(`Заголовок сообщения имеет неподдерживаемый тип протокола(1-5), получено: ${type}.`))
  }
}

function verifyOutgoingId (id: number): void {
  if (!Number.isInteger(id) || id < 1 || id > 0xFFFF_FFFF) {
    throw new FrameEncodeError(errorDetails.FrameEncodeError('Идентификатор сообщения должен находится в диапазоне 1 - 0xFFFF_FFFF.'))
  }
}

function verifyDecodedId (id: number): void {
  if (id < 1) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError('Идентификатор сообщения должен находится в диапазоне 1 - 0xFFFF_FFFF.'))
  }
}

function verifyOutgoingKey (key: number): void {
  if (!Number.isInteger(key) || key < 0 || key > 0xFFFF_FFFF) {
    throw new FrameEncodeError(errorDetails.FrameEncodeError('Ключ бинарных данных должен находится в диапазоне 0 - 0xFFFF_FFFF.'))
  }
}

/**
 * Эта функция должна использоваться для проверки превышения размера бинарного файла или аккумуляции размера бинарной карты файлов.
 */
function verifyOutgoingSize (size: number): void {
  if (size > 0xFFFF_FFFF) {
    throw new FrameEncodeError(errorDetails.FrameEncodeError('Размер данных не может превышать 0xFFFF_FFFF.'))
  }
}

function verifyOutgoingServiceCode (code: any): void {
  if (!serviceCodes.has(code)) {
    throw new FrameEncodeError(errorDetails.FrameEncodeError(`Код заголовка служебного сообщения должен быть одной из констант ${safeToJson([...serviceCodes.values()])}.`))
  }
}

function verifyDecodedServiceCode (code: any): void {
  if (!serviceCodes.has(code)) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError(`Код заголовка служебного сообщения должен быть одной из констант ${safeToJson([...serviceCodes.values()])}.`))
  }
}

function verifyDecodedPingHeader (header: TMfpDecodedHeader, refId: number) {
  if (header.id !== refId) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError(`Служебный фрейм PING должен иметь два равных идентификатора id:${header.id} !== refId:${refId}.`))
  }
  else if (!header.ownRefId) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError("Служебный фрейм PING должен иметь поле 'ownRefId:true'."))
  }
}

/**
 * Записывает заголовок в первый байт фрейма.
 *
 * @param view Буфер для записи первого байта заголовка.
 * @param protocolFirst3bit Константа {@link protocolTypesFirst3bit}.
 * @param hasChecksumFlag Нужно ли установить бит наличия контрольной суммы.
 * @param flags Число от 0 до 15. Для сервисного сообщения должна использоваться одна из констант
 *              {@link MFP_SERVICE_CODES}. Для других сообщений расчитываются флаги.
 */
function packHeader (view: DataView, protocolFirst3bit: number, hasChecksumFlag: boolean, flags: number): void {
  view.setUint8(0, protocolFirst3bit | (hasChecksumFlag ? 0b00010000 : 0) | flags)
}

/**
 * Распаковывает первый байт заголовка фрейма сообщения и уникальный идентификатор сообщения.
 *
 * @param view Ссылка на {@link DataView} сообщения.
 */
function unpackHeader (view: DataView): TMfpDecodedHeader {
  if (view.byteLength < 5) {
    throw new FrameDecodeError(errorDetails.FrameDecodeError(`Минимальная длина сообщения не может быть менее 5 байт, получено byteLength:${view.byteLength}.`))
  }
  const headerByte = view.getUint8(0) // Читаем первый байт
  // Первые 3 бита
  const type = (headerByte >> 5) as TMfpFrameType
  verifyDecodedProtocolType(type)
  const id = view.getUint32(1)
  verifyDecodedId(id)
  return Object.create(protoHeader, {
    type: { enumerable: true, value: type },
    id: { enumerable: true, value: id },
    _headerByte: { value: headerByte }
  })
}

/**
 * Опции {@link MfpFramer}.
 */
interface TMfpFramerOptions {
  /**
   * Поведение проверки контрольной суммы:
   *
   *   + `0` - По умолчанию. Не проверять и не устанавливать контрольную сумму. Предполагается что входящие сообщения не
   *           имеют checksum.
   *   + `1` - Проверить checksum если установлен флаг. Устанавливать флаг и добавлять в исходящие сообщения согласно
   *           получаемым параметрам.
   *   + `2` - Всегда проверять контрольную сумму и добавлять в исходящие сообщения, независимо от наличия флага.
   *           Предполагается что входящие сообщения всегда имеют checksum.
   */
  checksumVerification?: undefined | null | 0 | 1 | 2
  /**
   * Верификатор `checksum`, если параметр `checksumVerification` установлен в `1|2`, в противном случае этот параметр
   * игнорируется.
   *
   * **Важно:** Если этого поля нет и установлен параметр `checksumVerification:1|2`, поднимается ошибка.
   */
  checksumVerifier?: undefined | null | ChecksumVerifierLike
  /**
   * Максимальное количество входящих файлов.
   */
  maxIncomingFiles?: undefined | null | number
  /**
   * Максимальное количество исходящих файлов.
   */
  maxOutgoingFiles?: undefined | null | number
}

/**
 * Реализует упаковку и распаковку фреймов протокола `MultiplexFrameProtocol`.
 */
class MfpFramer {
  protected readonly _checksumVerifier: ChecksumVerifierLike
  protected readonly _checksumVerification: 0 | 1 | 2
  protected readonly _maxIncomingFiles: null | TPositiveInteger
  protected readonly _maxOutgoingFiles: null | TPositiveInteger

  protected readonly _getChecksumSize: ((hasChecksumFlag: boolean) => number)

  constructor(options?: undefined | null | TMfpFramerOptions) {
    this._checksumVerification = options
      ? (options.checksumVerification === 1 ? 1 : options.checksumVerification === 2 ? 2 : 0)
      : 0
    if (this._checksumVerification === 0) {
      this._checksumVerifier = checksumVerifierStub
      this._getChecksumSize = (_: any) => 0
    }
    else if (options?.checksumVerifier) {
      this._checksumVerifier = options.checksumVerifier
      this._getChecksumSize = (hasChecksumFlag: boolean) => (hasChecksumFlag || this._checksumVerification === 2) ? this._checksumVerifier.length : 0
    }
    else {
      throw new ConfigureError(errorDetails.ConfigureError("Использование параметра 'checksumVerification:1|2' предполагает обязательный параметр 'checksumVerifier'."))
    }
    this._maxIncomingFiles = positiveIntegerOrNull(options?.maxIncomingFiles)
    this._maxOutgoingFiles = positiveIntegerOrNull(options?.maxOutgoingFiles)
  }

  get checksumVerifier (): ChecksumVerifierLike { return this._checksumVerifier }
  get checksumVerification (): 0 | 1 | 2 { return this._checksumVerification }
  get maxIncomingFiles (): null | TPositiveInteger { return this._maxIncomingFiles }
  get maxOutgoingFiles (): null | TPositiveInteger { return this._maxOutgoingFiles }

  protected _checksumVerify (hasChecksumFlag: boolean, view: DataView): void {
    if ((this._checksumVerification === 2 || (this._checksumVerification === 1 && hasChecksumFlag)) && !this._checksumVerifier.verify(view)) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Ошибка контрольной суммы ${safeToJson(this._checksumVerifier.version)} сообщения.`))
    }
  }

  /**
   * Упаковывает объект сообщения в бинарный фрейм.
   *
   * @param message Объект сообщения одного из типов (message, request и т.д.).
   */
  public encode (message: TMfpDecodedFrame): ArrayBuffer {
    const protocolType = message.type
    switch (protocolType) {
      case MFP_FRAME_TYPES.service: return this.encodeService(message)
      case MFP_FRAME_TYPES.message: return this.encodeMessage(message)
      case MFP_FRAME_TYPES.request: return this.encodeRequest(message)
      case MFP_FRAME_TYPES.response: return this.encodeResponse(message)
      case MFP_FRAME_TYPES.binary: return this.encodeBinary(message) // наименьшая частота использования
      default:
        throw new FrameEncodeError(errorDetails.FrameEncodeError(`Недопустимый тип сообщения для кодирования: ${safeToJson(protocolType)}.`))
    }
  }

  /**
   * Распаковывает бинарный фрейм в объект сообщения.
   *
   * @param buffer ArrayBuffer, полученный из WebSocket.
   * @returns Объект сообщения одного из типов.
   */
  public decode (buffer: ArrayBuffer): TMfpDecodedFrame {
    const view = new DataView(buffer)
    const header = unpackHeader(view)
    if (this._checksumVerification !== 0) {
      this._checksumVerify(header.hasChecksum, view)
    }
    switch (header.type) {
      case MFP_FRAME_TYPES.service: return this._decodeService(header, view)
      case MFP_FRAME_TYPES.message: return this._decodeMessage(header, view)
      case MFP_FRAME_TYPES.request: return this._decodeRequest(header, view)
      case MFP_FRAME_TYPES.response: return this._decodeResponse(header, view)
      case MFP_FRAME_TYPES.binary: return this._decodeBinary(header, view)
      default:
        throw new FrameDecodeError(errorDetails.FrameDecodeError(`Недопустимый тип сообщения для декодирования: ${safeToJson(header.type)}.`))
    }
  }

  /**
   * Подготавливает массив карты бинарных файлов. Размер файлов не имеет значения и может быть нулевым.
   *
   * Если карта файлов пуста, возвращает `null`, иначе:
   *
   *  + `0` - Карта файлов в массиве.
   *  + `1` - Размер карты кратный 8(4+4) байтам.
   *  + `2` - Общий размер карты + файлов + 4байта.
   *
   * @param binaries Пользовательские файлы.
   */
  protected _prepareBinaries (binaries: Map<number, ArrayBuffer>, totalSize: number): null | [[number, number, ArrayBuffer][], number, number] {
    const entries: [number, number, ArrayBuffer][] = []
    let totalMapSize = 0
    let oldMapSize = 0
    let oldTotalSize = 0
    for (const [key, buff] of binaries) {
      verifyOutgoingKey(key)
      verifyOutgoingSize(buff.byteLength)
      entries.push([key, buff.byteLength, buff])
      totalMapSize += 8
      totalSize += 8 + buff.byteLength
      // Проверка на переполнение
      if (totalMapSize < oldMapSize || totalSize < oldTotalSize) {
        throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера карты бинарных данных.'))
      }
      oldMapSize = totalMapSize
      oldTotalSize = totalSize
    }
    if (totalMapSize === 0) {
      return null
    }
    verifyOutgoingSize(totalMapSize)
    if (this._maxOutgoingFiles && entries.length > this._maxOutgoingFiles) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Превышено максимальное количество исходящих файлов '${this._maxOutgoingFiles}', получено '${entries.length}'.`))
    }
    totalSize += 4
    if (totalSize < oldTotalSize) {
      throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера карты бинарных данных.'))
    }
    return [entries, totalMapSize, totalSize]
  }

  /**
   * Подготавливает массив анонсированных уникальных номеров файлов.
   * Возвращает результат аналогичный {@link _prepareBinaries()}, но с массивом кратным 4 байтам.
   */
  protected _prepareExpected (set: Set<number>, totalSize: number): null | [number[], number, number] {
    const expected: number[] = []
    let setSize = 0
    let oldSize = 0
    let oldTotalSize = 0
    for (const key of set) {
      verifyOutgoingKey(key)
      expected.push(key)
      setSize += 4
      totalSize += 4
      // Проверка на переполнение
      if (setSize < oldSize || totalSize < oldTotalSize) {
        throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера набора ожидаемых файлов.'))
      }
      oldSize = setSize
      oldTotalSize = totalSize
    }
    if (setSize === 0) {
      return null
    }
    verifyOutgoingSize(setSize)
    if (this._maxOutgoingFiles && expected.length > this._maxOutgoingFiles) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Превышено максимальное количество исходящих файлов '${this._maxOutgoingFiles}', получено '${expected.length}'.`))
    }
    totalSize += 4
    if (totalSize < oldTotalSize) {
      throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера набора ожидаемых файлов.'))
    }
    return [expected, setSize, totalSize]
  }

  /**
   * Записывает бинарные файлы в DataView и возвращает последнее смещение.
   */
  protected _encodeBinaries (
    view: DataView,
    uint8: Uint8Array,
    binaries: [number, number, ArrayBuffer][],
    offset: number
  ): number {
    for (const [key, size] of binaries) {
      view.setUint32(offset, key)
      view.setUint32(offset + 4, size)
      offset += 8
    }
    for (const [_, size, buff] of binaries) {
      uint8.set(new Uint8Array(buff), offset)
      offset += size
    }
    return offset
  }

  protected _encodeExpected (
    view: DataView,
    expected: number[],
    offset: number
  ): number {
    for (const key of expected) {
      view.setUint32(offset, key)
      offset += 4
    }
    return offset
  }

  /**
   * Упаковывает сообщение с данными и файлами.
   *
   * @param protocolFirst3bit Константа {@link protocolTypesFirst3bit} только для `message|request|response`.
   * @param id
   * @param payload
   * @param binaries
   * @param expected
   * @param streaming
   * @param needAck
   * @param useChecksum
   * @param refId Должен быть установлен для типа {@link MFP_FRAME_TYPES.response}
   */
  protected _encodePayload (
    protocolFirst3bit: number,
    id: number,
    payload: null | ArrayBuffer,
    binaries: null | Map<number, ArrayBuffer>,
    expected: null | Set<number>,
    streaming: boolean,
    needAck: boolean,
    useChecksum: boolean,
    refId?: number
  ): ArrayBuffer {
    const responseType = protocolFirst3bit === protocolTypesFirst3bit.response
    verifyOutgoingId(id)
    if (responseType) {
      verifyOutgoingId(refId!)
    }
    const checksumSize = this._getChecksumSize(useChecksum)
    let totalSize = 5 + checksumSize + (responseType ? 4 : 0)

    let flags = needAck ? 0b1000 : 0b0000
    const data = payload && payload.byteLength > 0 ? payload : null
    if (data) {
      verifyOutgoingSize(data.byteLength)
      flags |= 0b0001
      const oldSize = totalSize
      totalSize += 4 + data.byteLength
      if (totalSize < oldSize) {
        throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера сообщения.'))
      }
    }

    let binmap: null | null | [[number, number, ArrayBuffer][], number, number] = null
    let binset: null | null | [number[], number, number] = null
    if (binaries) {
      if ((binmap = this._prepareBinaries(binaries, totalSize))) {
        flags |= 0b0110
        totalSize = binmap[2]!
      }
    }
    else if (expected) {
      if ((binset = this._prepareExpected(expected, totalSize))) {
        flags |= 0b0010
        totalSize = binset[2]
      }
    }
    else if (streaming) {
      flags |= 0b0100
    }

    let buffer!: ArrayBuffer
    let uint8!: Uint8Array
    let view!: DataView
    try {
      buffer = new ArrayBuffer(totalSize)
      uint8 = new Uint8Array(buffer)
      view = new DataView(buffer)
    } catch (e) {
      throw new FrameEncodeError(errorDetails.FrameEncodeError(`Превышение максимально возможного размера ArrayBuffer для упаковки сообщения, вычисленный суммарный размер сообщения: ${safeToJson(totalSize)}.`, e))
    }

    packHeader(view, protocolFirst3bit, checksumSize > 0, flags)
    view.setUint32(1, id)
    let offset = 5
    if (responseType) {
      view.setUint32(offset, refId!)
      offset += 4
    }

    if (data) {
      view.setUint32(offset, data.byteLength)
      offset += 4
    }
    if (binmap) {
      view.setUint32(offset, binmap[1])
      offset += 4
    }
    else if (binset) {
      view.setUint32(offset, binset[1])
      offset += 4
    }
    if (data) {
      uint8.set(new Uint8Array(data), offset)
      offset += data.byteLength
    }
    if (binmap) {
      offset = this._encodeBinaries(view, uint8, binmap[0], offset)
    }
    else if (binset) {
      offset = this._encodeExpected(view, binset[0], offset)
    }

    if (checksumSize) {
      this._checksumVerifier.write(view)
    }

    return buffer
  }

  /**
   * Создает фрейм типа {@link TMfpFrameTypes.service}.
   *
   * **Важно:** Код сообщения {@link TMfpService.code}, устанавливаемый флагам, должен передаваться
   * внешними инструментами. Данный метод упаковывает сообщение с предоставленным кодом и не читает отдельных параметров.
   * Код должен быть получен из набора констант {@link MFP_SERVICE_CODES} не включая `0`.
   */
  encodeService (params: Pick<TMfpService, 'id' | 'code' | 'refId' | 'ownRefId' | 'checksum'>): ArrayBuffer {
    verifyOutgoingId(params.id)
    verifyOutgoingId(params.refId)
    verifyOutgoingServiceCode(params.code)
    const checksumSize = this._getChecksumSize(params.checksum)
    const buffer = new ArrayBuffer(9 + checksumSize)
    const view = new DataView(buffer)
    const code = params.ownRefId ? (params.code | 0b00001000) : params.code
    packHeader(view, protocolTypesFirst3bit.service, checksumSize > 0, code)
    view.setUint32(1, params.id)
    view.setUint32(5, params.refId)
    if (checksumSize) {
      this._checksumVerifier.write(view)
    }
    return buffer
  }

  /**
   * Создает фрейм типа {@link TMfpFrameTypes.message}.
   */
  encodeMessage (params: Omit<TMfpMessage, 'type'>): ArrayBuffer {
    return this._encodePayload(
      protocolTypesFirst3bit.message,
      params.id,
      params.data,
      params.binaries,
      params.expected,
      params.streaming,
      params.needAck,
      params.checksum
    )
  }

  /**
   * Создает фрейм типа {@link TMfpFrameTypes.request}.
   */
  encodeRequest (params: Omit<TMfpRequest, 'type'>): ArrayBuffer {
    return this._encodePayload(
      protocolTypesFirst3bit.request,
      params.id,
      params.data,
      params.binaries,
      null,
      false,
      params.needAck,
      params.checksum
    )
  }

  /**
   * Создает фрейм типа {@link TMfpFrameTypes.binary}.
   *
   * Пустой `bin: ArrayBuffer` не считается ошибкой и будет упакован.
   *
   * Если это сообщение без файла или {@link TMfpPartBin.hasData}, параметр {@link TMfpPartBin.key} игнорируется и не
   * устанавливается сообщению.
   */
  encodeBinary (params: Omit<TMfpBinary, 'type'>): ArrayBuffer {
    verifyOutgoingId(params.id)
    verifyOutgoingId(params.refId)
    const checksumSize = this._getChecksumSize(params.checksum)
    let totalSize = 9 + checksumSize
    const content = params.hasData ? 0b0110 : params.hasExpected ? 0b0010 : params.hasStreaming ? 0b0100 : 0
    if (params.bin) {
      if (!content) {
        throw new ProtocolError(errorDetails.ProtocolError('Сообщение binary с любым типом данных bin, должно иметь один из флагов hasData/hasExpected/hasStreaming.'))
      }
      // Если это файл, то обязательно добавляется ключ
      if (content !== 0b0110) {
        verifyOutgoingKey(params.key)
        totalSize += 4
      }
      verifyOutgoingSize(params.bin.byteLength)
      const oldSize = totalSize
      totalSize += params.bin.byteLength
      if (totalSize < oldSize) {
        throw new FrameEncodeError(errorDetails.FrameEncodeError('Ошибка переполнения размера сообщения.'))
      }
    }
    else if (content) {
      throw new ProtocolError(errorDetails.ProtocolError('Сообщение binary с одним из флагов hasData/hasExpected/hasStreaming должно иметь поле bin с данными.'))
    }

    let buffer!: ArrayBuffer
    let view!: DataView
    try {
      buffer = new ArrayBuffer(totalSize)
      view = new DataView(buffer)
    } catch (e) {
      throw new FrameEncodeError(errorDetails.FrameEncodeError(`Превышение максимально возможного размера ArrayBuffer для упаковки сообщения, вычисленный суммарный размер сообщения: ${safeToJson(totalSize)}.`, e))
    }

    const flags = (params.needAck ? 0b1000 : 0) | content | (params.final ? 0 : 0b0001)
    packHeader(view, protocolTypesFirst3bit.binary, checksumSize > 0, flags)
    view.setUint32(1, params.id)
    view.setUint32(5, params.refId)
    if (params.bin) {
      let offset = 9
      // Ключ устанавливается только для файлов.
      if (content !== 0b0110) {
        view.setUint32(9, params.key)
        offset = 13
      }
      new Uint8Array(buffer).set(new Uint8Array(params.bin), offset)
    }
    if (checksumSize) {
      this._checksumVerifier.write(view)
    }
    return buffer
  }

  /**
   * Создает фрейм типа {@link TMfpFrameTypes.response}.
   */
  encodeResponse (params: Omit<TMfpResponse, 'type'>): ArrayBuffer {
    return this._encodePayload(
      protocolTypesFirst3bit.response,
      params.id,
      params.data,
      params.binaries,
      null,
      false,
      params.needAck,
      params.checksum,
      params.refId
    )
  }

  protected _decodeBinmapSize (view: DataView, dataEndOffset: number, offset: number): [Map<number, number>, number] {
    if (dataEndOffset < offset + 4) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить 4 байта размера размера карты бинарных данных.'))
    }
    const mapSize = view.getUint32(offset)
    if (mapSize === 0 || mapSize % 8 !== 0) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер карты бинарных данных не может быть равен нулю и должен быть кратен 8 байтам.'))
    }
    return [new Map<number, number>(), mapSize]
  }

  protected _decodeBinsetSize (view: DataView, dataEndOffset: number, offset: number): [Set<number>, number] {
    if (dataEndOffset < offset + 4) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить 4 байта размера набора бинарных данных.'))
    }
    const setSize = view.getUint32(offset)
    if (setSize === 0 || setSize % 4 !== 0) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер набора бинарных данных не может быть равен нулю и должен быть кратен 4 байтам.'))
    }
    return [new Set<number>(), setSize]
  }

  protected _decodeBinmap (view: DataView, map: Map<number, number>, mapSize: number, dataEndOffset: number, offset: number): [number, number] {
    let totalBinSize = 0
    if (dataEndOffset < offset + mapSize) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить карту бинарных данных.'))
    }
    const chunks = mapSize / 8
    // NOTE Защиту от DoS когда файлы могут быть маленькими, но их количество нагрузит сервер
    if (this._maxIncomingFiles && chunks > this._maxIncomingFiles) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Превышено максимальное количество входящих файлов '${this._maxIncomingFiles}', получено '${chunks}'.`))
    }
    let oldSize = 0
    for (let i = 0; i < chunks; ++i) {
      const key = view.getUint32(offset)
      if (map.has(key)) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('В карте бинарных данных обнаружен недопустимый дубликат ключа.'))
      }
      const size = view.getUint32(offset + 4)
      offset += 8
      totalBinSize += size
      if (totalBinSize < oldSize) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('Ошибка переполнения размера карты бинарных данных.'))
      }
      oldSize = totalBinSize
      map.set(key, size)
    }
    return [offset, totalBinSize]
  }

  protected _decodeBinset (view: DataView, set: Set<number>, setSize: number, dataEndOffset: number, offset: number): number {

    if (dataEndOffset < offset + setSize) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить набор бинарных данных.'))
    }
    const chunks = setSize / 4
    if (this._maxIncomingFiles && chunks > this._maxIncomingFiles) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Превышено максимальное количество входящих файлов '${this._maxIncomingFiles}', получено '${chunks}'.`))
    }
    for (let i = 0; i < chunks; ++i) {
      const key = view.getUint32(offset)
      if (set.has(key)) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('В наборе бинарных данных обнаружен недопустимый дубликат ключа.'))
      }
      offset += 4
      set.add(key)
    }
    return offset
  }

  protected _decodeBinaries (view: DataView, binmap: Map<number, number>, offset: number): number {
    for (const [key, size] of binmap) {
      (binmap as unknown as Map<number, ArrayBuffer>).set(key, view.buffer.slice(offset, offset + size))
      offset += size
    }
    return offset
  }

  /**
   * Извлекает данные из сообщений `message|request|response`.
   *
   * @param offset Для message|request это 5, для response 9(учитывает refId)
   * @param header
   * @param view
   */
  protected _decodePayload (initialOffset: 5 | 9, header: TMfpDecodedHeader, view: DataView) {
    let offset: number = initialOffset
    const checksumSize = this._getChecksumSize(header.hasChecksum)
    const dataEndOffset = view.byteLength - checksumSize
    let dataSize = 0
    if (header.hasData) {
      if (dataEndOffset < offset + 4) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить 4 байта размера данных.'))
      }
      dataSize = view.getUint32(offset)
      offset += 4
    }

    let binmap: null | [Map<number, number>, number] = null
    let binset: null | [Set<number>, number] = null
    let streaming = false
    // Проверяем флаги именно в таком порядке
    // 1 - 0иb0110 hasBinaries
    // 2 - 0иb0010 hasExpected
    // 3 - 0иb0100 hasStreaming
    if (header.hasBinaries) {
      binmap = this._decodeBinmapSize(view, dataEndOffset, offset)
      offset += 4
    }
    else if (header.hasExpected) {
      binset = this._decodeBinsetSize(view, dataEndOffset, offset)
      offset += 4
    }
    else if (header.hasStreaming) {
      streaming = true
    }

    let data: null | ArrayBuffer = null
    if (dataSize > 0) {
      if (dataEndOffset < offset + dataSize) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить данные.'))
      }
      data = view.buffer.slice(offset, offset + dataSize)
      offset += dataSize
    }

    let totalBinSize = 0
    if (binmap) {
      [offset, totalBinSize] = this._decodeBinmap(view, binmap[0], binmap[1], dataEndOffset, offset)
      // totalBinSize - сумма всех размеров файлов
      if (dataEndOffset !== offset + totalBinSize) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError('Размер фрейма сообщения не совпадает с ожидаемым и не может вместить бинарные данные.'))
      }
      offset = this._decodeBinaries(view, binmap[0], offset)
    }
    else if (binset) {
      offset = this._decodeBinset(view, binset[0], binset[1], dataEndOffset, offset)
    }

    if (offset !== dataEndOffset) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Общая длина фрейма ${view.byteLength} не соответствует сумме его частей ${offset + checksumSize}.`))
    }

    return {
      data,
      binaries: binmap ? binmap[0] as unknown as Map<number, ArrayBuffer> : null,
      expected: binset ? binset[0] : null,
      streaming
    }
  }

  protected _decodeService (header: TMfpDecodedHeader, view: DataView): TMfpService {
    const checksumSize = this._getChecksumSize(header.hasChecksum)
    if (view.byteLength !== 9 + checksumSize) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError(`Фрейм служебного сообщения должен иметь ровно ${9 + checksumSize} байт.`))
    }
    verifyDecodedServiceCode(header.code)
    const refId = view.getUint32(5)
    verifyDecodedId(refId)
    // Если это ping, то идентификаторы должны быть равны
    if (header.code === MFP_SERVICE_CODES.ping) {
      verifyDecodedPingHeader(header, refId)
    }
    return Object.create(protoService, {
      id: {
        enumerable: true,
        value: header.id
      },
      code: {
        enumerable: true,
        value: header.code
      },
      refId: {
        enumerable: true,
        value: refId
      },
      ownRefId: {
        enumerable: true,
        value: header.ownRefId
      },
      checksum: {
        enumerable: true,
        value: header.hasChecksum
      }
    })
  }

  protected _decodeMessage (header: TMfpDecodedHeader, view: DataView): TMfpMessage {
    const payload = this._decodePayload(5, header, view)
    return {
      type: MFP_FRAME_TYPES.message,
      id: header.id,
      data: payload.data,
      binaries: payload.binaries,
      expected: payload.expected,
      streaming: payload.streaming,
      needAck: header.needAck,
      checksum: header.hasChecksum
    }
  }

  protected _decodeRequest (header: TMfpDecodedHeader, view: DataView): TMfpRequest {
    const payload = this._decodePayload(5, header, view)
    if (payload.expected || payload.streaming) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError("Сообщения 'request' не могут иметь флаг предварительного набора файлов 'expected' или флаг 'streaming'."))
    }
    return {
      type: MFP_FRAME_TYPES.request,
      id: header.id,
      data: payload.data,
      binaries: payload.binaries,
      needAck: header.needAck,
      checksum: header.hasChecksum
    }
  }

  protected _decodeBinary (header: TMfpDecodedHeader, view: DataView): TMfpBinary {
    // Конвертируем флаги message:2 к типу сообщения binary:4
    const hasData = header.hasBinaries
    const hasExpected = !hasData && header.hasExpected
    const hasStreaming = !hasData && header.hasStreaming
    // Идентификатор refId обязателен
    if (view.byteLength < 9) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError("Размер сообщения 'binary' не совпадает с ожидаемым и не может вместить 4 байта 'refId'."))
    }
    const refId = view.getUint32(5)
    verifyDecodedId(refId)
    const checksumSize = this._getChecksumSize(header.hasChecksum)
    const dataEndOffset = view.byteLength - checksumSize
    // Сообщение может прийти без файла, тогда key будет отсутствовать. Иначе ключ обязателен
    let key = 0
    let offset = 9
    if (hasExpected || hasStreaming) {
      if (dataEndOffset < 13) {
        throw new FrameDecodeError(errorDetails.FrameDecodeError("Размер сообщения 'binary' не совпадает с ожидаемым и не может вместить 4 байта 'key'."))
      }
      key = view.getUint32(9)
      offset = 13
    }
    // Дальше могут быть только данные
    let bin: ArrayBuffer | null = null
    if (hasData || hasExpected || hasStreaming) {
      // Если пользователь отправил пустой ArrayBuffer, зеркально отражаем структуру, независимо от отсутствия данных
      bin = (dataEndOffset > offset)
        ? view.buffer.slice(offset, dataEndOffset)
        : new ArrayBuffer(0)
    }
    return {
      type: MFP_FRAME_TYPES.binary,
      id: header.id,
      refId,
      key,
      bin,
      hasData,
      hasExpected,
      hasStreaming,
      final: !header.hasData,
      needAck: header.needAck,
      checksum: header.hasChecksum
    }
  }

  protected _decodeResponse (header: TMfpDecodedHeader, view: DataView): TMfpResponse {
    if (view.byteLength < 9) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError("Размер сообщения 'response' не совпадает с ожидаемым и не может вместить обязательный 'refId'."))
    }
    const refId = view.getUint32(5)
    verifyDecodedId(refId)
    const payload = this._decodePayload(9, header, view)
    if (payload.expected || payload.streaming) {
      throw new FrameDecodeError(errorDetails.FrameDecodeError("Сообщения 'response' не могут иметь флаг предварительного набора файлов 'expected' или флаг 'streaming'."))
    }
    return {
      type: MFP_FRAME_TYPES.response,
      id: header.id,
      refId,
      data: payload.data,
      binaries: payload.binaries,
      needAck: header.needAck,
      checksum: header.hasChecksum
    }
  }
}

export {
  type TMfpFramerOptions,
  MfpFramer
}
