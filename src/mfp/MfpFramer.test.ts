import { describe, beforeEach, afterEach, test, expect } from 'vitest'
import { ChecksumVerifierXOR8 } from '../checksum/ChecksumVerifierXOR8.js'
import { JsonBufferCodec } from '../libs/JsonBufferCodec.js'
import {
  MFP_FRAME_TYPES,
  // type TMfpFrameTypes,
  // type TMfpFrameType,
  MFP_SERVICE_CODES,
  // type TMfpServiceCodes,
  type TMfpServiceCode,
  // type TMfpPartBase,
  // type TMfpPartData,
  // type TMfpPartBinaries,
  // type TMfpPartExpected,
  // type TMfpPartStreaming,
  // type TMfpPartNeedAck,
  // type TMfpPartBin,
  type TMfpService,
  type TMfpMessage,
  type TMfpRequest,
  type TMfpBinary,
  type TMfpResponse,
  // type TMfpDecodedFrame,
  // type TMfpDecodedHeader
} from './types.js'
import {
  // type TMfpFramerOptions,
  MfpFramer
} from './MfpFramer.js'

const isCounter = {
  _id: 0,
  next: () => ++isCounter._id
}

function serviceConvertToObject (message: TMfpService | any): TMfpService {
  return {
    type: message.type,
    id: message.id,
    code: message.code,
    refId: message.refId,
    ownRefId: message.ownRefId,
    checksum: message.checksum,
    ack: message.ack,
    timeout: message.timeout,
    abort: message.abort,
    unknown: message.unknown,
    ping: message.ping
  }
}

test('MfpFramer: started', async () => {
  const codec = new JsonBufferCodec()
  const verifier = new ChecksumVerifierXOR8()
  const framer = new MfpFramer({
    checksumVerification: 1, // checksum контролируется флагами
    checksumVerifier: verifier
  })

  const file1 = new ArrayBuffer(100)
  const file2 = new ArrayBuffer(200)
  const message: TMfpMessage = {
    type: MFP_FRAME_TYPES.message,
    id: isCounter.next(),
    data: codec.jsonLikeToBuffer({ message: 'hello' }).buffer, // приведем Uint8Array к ArrayBuffer
    binaries: new Map([[0, file1], [1, file2]]),
    expected: null,
    streaming: false,
    needAck: false,
    checksum: true
  }

  const encoded1 = framer.encode(message)
  const decoded1 = framer.decode(encoded1)
  expect(decoded1).toStrictEqual(message)
  expect(codec.bufferToJsonLike((decoded1 as TMfpMessage).data!)).toStrictEqual({ message: 'hello' })
})

describe('MfpFramer', () => {
  let codec: JsonBufferCodec
  let verifier: ChecksumVerifierXOR8
  let framer: MfpFramer
  let framerStrictChecksum: MfpFramer

  beforeEach(() => {
    codec = new JsonBufferCodec()
    verifier = new ChecksumVerifierXOR8()
    framer = new MfpFramer({
      checksumVerification: 1, // Проверка по флагу
      checksumVerifier: verifier,
      maxIncomingFiles: 10,
      maxOutgoingFiles: 10
    })
    framerStrictChecksum = new MfpFramer({
      checksumVerification: 2, // Всегда проверять
      checksumVerifier: verifier,
      maxIncomingFiles: 10,
      maxOutgoingFiles: 10
    })
  })

  afterEach(() => {
    isCounter._id = 0
  })

  test('MfpFramer: TMfpService', async () => {
    // Тест для каждого кода service
    const codes: Exclude<TMfpServiceCode, 0>[] = [
      MFP_SERVICE_CODES.ack,
      MFP_SERVICE_CODES.timeout,
      MFP_SERVICE_CODES.abort,
      MFP_SERVICE_CODES.unknown,
      MFP_SERVICE_CODES.ping
    ]

    for (const code of codes) {
      const isPing = code === MFP_SERVICE_CODES.ping
      const message: TMfpService = {
        type: MFP_FRAME_TYPES.service,
        id: isCounter.next(),
        code,
        refId: isPing ? isCounter._id : isCounter.next(),
        ownRefId: isPing ? true : false,
        checksum: true,
        ack: code === MFP_SERVICE_CODES.ack,
        timeout: code === MFP_SERVICE_CODES.timeout,
        abort: code === MFP_SERVICE_CODES.abort,
        unknown: code === MFP_SERVICE_CODES.unknown,
        ping: code === MFP_SERVICE_CODES.ping
      }

      const encoded = framer.encode(message)
      const decoded = framer.decode(encoded)
      expect(serviceConvertToObject(decoded)).toStrictEqual(message)

      // Тест с ownRefId: true для не-ping
      if (!isPing) {
        const messageOwnRefId: TMfpService = { ...message, ownRefId: true }
        const encodedOwnRefId = framer.encode(messageOwnRefId)
        const decodedOwnRefId = framer.decode(encodedOwnRefId)
        expect(serviceConvertToObject(decodedOwnRefId)).toStrictEqual(messageOwnRefId)
      }

      // Тест с checksumVerification: 2
      const encodedStrict = framerStrictChecksum.encode(message)
      const decodedStrict = framerStrictChecksum.decode(encodedStrict)
      expect(serviceConvertToObject(decodedStrict)).toStrictEqual(message)
    }
  })

  test('MfpFramer: TMfpMessage', async () => {
    const file1 = new ArrayBuffer(100)
    const file2 = new ArrayBuffer(0) // Пустой файл
    const data = codec.jsonLikeToBuffer({ message: 'hello' }).buffer

    // Полное сообщение: data + binaries + needAck + checksum
    const messageFull: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data,
      binaries: new Map([[0, file1], [1, file2]]),
      expected: null,
      streaming: false,
      needAck: true,
      checksum: true
    }
    let encoded = framer.encode(messageFull)
    let decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageFull)

    // Только data
    const messageData: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data,
      binaries: null,
      expected: null,
      streaming: false,
      needAck: false,
      checksum: false
    }
    encoded = framer.encode(messageData)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageData)

    // Только binaries (включая пустой файл)
    const messageBinaries: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data: null,
      binaries: new Map([[0, file1], [1, file2]]),
      expected: null,
      streaming: false,
      needAck: false,
      checksum: true
    }
    encoded = framer.encode(messageBinaries)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageBinaries)

    // Expected (анонс файлов)
    const messageExpected: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data: null,
      binaries: null,
      expected: new Set([0, 1]),
      streaming: false,
      needAck: true,
      checksum: true
    }
    encoded = framer.encode(messageExpected)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageExpected)

    // Streaming
    const messageStreaming: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data: null,
      binaries: null,
      expected: null,
      streaming: true,
      needAck: false,
      checksum: false
    }
    encoded = framer.encode(messageStreaming)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageStreaming)

    // Флаг 0b0111 (data + binaries)
    const messageDataAndBinaries: TMfpMessage = {
      type: MFP_FRAME_TYPES.message,
      id: isCounter.next(),
      data,
      binaries: new Map([[0, file1]]),
      expected: null,
      streaming: false,
      needAck: true,
      checksum: true
    }
    encoded = framer.encode(messageDataAndBinaries)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(messageDataAndBinaries)

    // Тест с checksumVerification: 2
    encoded = framerStrictChecksum.encode(messageFull)
    decoded = framerStrictChecksum.decode(encoded)
    expect(decoded).toStrictEqual(messageFull)
  })

  test('MfpFramer: TMfpRequest', async () => {
    const file1 = new ArrayBuffer(100)
    const file2 = new ArrayBuffer(0) // Пустой файл
    const data = codec.jsonLikeToBuffer({ request: 'test' }).buffer

    // Полное сообщение: data + binaries + needAck + checksum
    const request: TMfpRequest = {
      type: MFP_FRAME_TYPES.request,
      id: isCounter.next(),
      data,
      binaries: new Map([[0, file1], [1, file2]]),
      needAck: true,
      checksum: true
    }
    let encoded = framer.encode(request)
    let decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(request)

    // Только data
    const requestData: TMfpRequest = {
      type: MFP_FRAME_TYPES.request,
      id: isCounter.next(),
      data,
      binaries: null,
      needAck: false,
      checksum: false
    }
    encoded = framer.encode(requestData)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(requestData)

    // Только binaries
    const requestBinaries: TMfpRequest = {
      type: MFP_FRAME_TYPES.request,
      id: isCounter.next(),
      data: null,
      binaries: new Map([[0, file1], [1, file2]]),
      needAck: true,
      checksum: true
    }
    encoded = framer.encode(requestBinaries)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(requestBinaries)

    // Тест с checksumVerification: 2
    encoded = framerStrictChecksum.encode(request)
    decoded = framerStrictChecksum.decode(encoded)
    expect(decoded).toStrictEqual(request)
  })

  test('MfpFramer: TMfpBinary', async () => {
    const file1 = new ArrayBuffer(100)
    const file2 = new ArrayBuffer(0) // Пустой файл
    const data = codec.jsonLikeToBuffer({ error: 'test' }).buffer
    const refId = isCounter.next()

    // hasExpected
    const binaryExpected: TMfpBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: isCounter.next(),
      refId,
      key: 0,
      bin: file1,
      hasExpected: true,
      hasStreaming: false,
      hasData: false,
      final: false,
      needAck: true,
      checksum: true
    }
    let encoded = framer.encode(binaryExpected)
    let decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(binaryExpected)

    // hasStreaming
    const binaryStreaming: TMfpBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: isCounter.next(),
      refId,
      key: 1,
      bin: file2, // Пустой файл
      hasExpected: false,
      hasStreaming: true,
      hasData: false,
      final: false,
      needAck: false,
      checksum: true
    }
    encoded = framer.encode(binaryStreaming)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(binaryStreaming)

    // hasData
    const binaryData: TMfpBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: isCounter.next(),
      refId,
      key: 0, // Игнорируется
      bin: data,
      hasExpected: false,
      hasStreaming: false,
      hasData: true,
      final: true,
      needAck: true,
      checksum: true
    }
    encoded = framer.encode(binaryData)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(binaryData)

    // Final без bin
    const binaryFinal: TMfpBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: isCounter.next(),
      refId,
      key: 0,
      bin: null,
      hasExpected: false,
      hasStreaming: false,
      hasData: false,
      final: true,
      needAck: false,
      checksum: true
    }
    encoded = framer.encode(binaryFinal)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(binaryFinal)

    // Тест с checksumVerification: 2
    encoded = framerStrictChecksum.encode(binaryExpected)
    decoded = framerStrictChecksum.decode(encoded)
    expect(decoded).toStrictEqual(binaryExpected)
  })

  test('MfpFramer: TMfpResponse', async () => {
    const file1 = new ArrayBuffer(100)
    const file2 = new ArrayBuffer(0) // Пустой файл
    const data = codec.jsonLikeToBuffer({ response: 'ok' }).buffer
    const refId = isCounter.next()

    // Полное сообщение: data + binaries + needAck + checksum
    const response: TMfpResponse = {
      type: MFP_FRAME_TYPES.response,
      id: isCounter.next(),
      refId,
      data,
      binaries: new Map([[0, file1], [1, file2]]),
      needAck: true,
      checksum: true
    }
    let encoded = framer.encode(response)
    let decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(response)

    // Только data
    const responseData: TMfpResponse = {
      type: MFP_FRAME_TYPES.response,
      id: isCounter.next(),
      refId,
      data,
      binaries: null,
      needAck: false,
      checksum: false
    }
    encoded = framer.encode(responseData)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(responseData)

    // Только binaries
    const responseBinaries: TMfpResponse = {
      type: MFP_FRAME_TYPES.response,
      id: isCounter.next(),
      refId,
      data: null,
      binaries: new Map([[0, file1], [1, file2]]),
      needAck: true,
      checksum: true
    }
    encoded = framer.encode(responseBinaries)
    decoded = framer.decode(encoded)
    expect(decoded).toStrictEqual(responseBinaries)

    // Тест с checksumVerification: 2
    encoded = framerStrictChecksum.encode(response)
    decoded = framerStrictChecksum.decode(encoded)
    expect(decoded).toStrictEqual(response)
  })

  test('MfpFramer: Errors', async () => {
    const file1 = new ArrayBuffer(100)
    const data = codec.jsonLikeToBuffer({ message: 'hello' }).buffer

    // Невалидный тип протокола
    expect(() => {
      const buffer = new ArrayBuffer(5)
      const view = new DataView(buffer)
      view.setUint8(0, 6 << 5) // Тип 6
      view.setUint32(1, 1)
      framer.decode(buffer)
    }).toThrowError(/неподдерживаемый тип протокола/)

    // Невалидный id
    expect(() => {
      const message: TMfpMessage = {
        type: MFP_FRAME_TYPES.message,
        id: 0, // Невалидный
        data,
        binaries: null,
        expected: null,
        streaming: false,
        needAck: false,
        checksum: false
      }
      framer.encode(message)
    }).toThrowError(/диапазоне 1 - 0xFFFF_FFFF/)

    // Невалидный refId в response
    expect(() => {
      const response: TMfpResponse = {
        type: MFP_FRAME_TYPES.response,
        id: isCounter.next(),
        refId: 0, // Невалидный
        data,
        binaries: null,
        needAck: false,
        checksum: false
      }
      framer.encode(response)
    }).toThrowError(/диапазоне 1 - 0xFFFF_FFFF/)

    // Невалидный ключ в binaries
    expect(() => {
      const message: TMfpMessage = {
        type: MFP_FRAME_TYPES.message,
        id: isCounter.next(),
        data: null,
        binaries: new Map([[-1, file1]]), // Невалидный ключ
        expected: null,
        streaming: false,
        needAck: false,
        checksum: false
      }
      framer.encode(message)
    }).toThrowError(/диапазоне 0 - 0xFFFF_FFFF/)

    // Превышение maxOutgoingFiles
    expect(() => {
      const binaries = new Map<number, ArrayBuffer>()
      for (let i = 0; i < 11; i++) {
        binaries.set(i, file1)
      }
      const message: TMfpMessage = {
        type: MFP_FRAME_TYPES.message,
        id: isCounter.next(),
        data: null,
        binaries,
        expected: null,
        streaming: false,
        needAck: false,
        checksum: false
      }
      framer.encode(message)
    }).toThrowError(/максимальное количество исходящих файлов/)

    // Дубликат ключа в binaries
    expect(() => {
      const buffer = new ArrayBuffer(30) // [header:1][id:4][size(payload):4][size(map):4][payload:0][map:16][bin:0][checksum:1]
      const view = new DataView(buffer)
      view.setUint8(0, MFP_FRAME_TYPES.message << 5 | 0b0111 | 0b10000) // message, data+binaries, checksum
      view.setUint32(1, 1) // id
      view.setUint32(5, 0) // size(payload)
      view.setUint32(9, 16) // size(map) = 16 байт (две пары [key:4][size:4])
      view.setUint32(13, 0) // key1
      view.setUint32(17, 0) // size1
      view.setUint32(21, 0) // key2 (дубликат)
      view.setUint32(25, 0) // size2
      const verifier = new ChecksumVerifierXOR8()
      verifier.write(view)
      framer.decode(buffer)
    }).toThrowError(/дубликат ключа/)

    // Ошибка контрольной суммы
    expect(() => {
      const message: TMfpMessage = {
        type: MFP_FRAME_TYPES.message,
        id: isCounter.next(),
        data,
        binaries: null,
        expected: null,
        streaming: false,
        needAck: false,
        checksum: true
      }
      const encoded = framer.encode(message)
      const view = new DataView(encoded)
      view.setUint8(encoded.byteLength - 1, 0xFF) // Испортить checksum
      framerStrictChecksum.decode(encoded)
    }).toThrowError(/Ошибка контрольной суммы/)

    // expected в message
    expect(() => {
      const buffer = new ArrayBuffer(9) // [header:1][id:4][size(set):4]
      const view = new DataView(buffer)
      view.setUint8(0, MFP_FRAME_TYPES.message << 5 | 0b0010) // request, expected
      view.setUint32(1, 1)
      view.setUint32(5, 0) // size(set) = 4 байта
      framer.decode(buffer)
    }).toThrowError(/Размер набора бинарных данных не может быть равен нулю и должен быть кратен 4 байтам./)

    // expected в request
    expect(() => {
      const buffer = new ArrayBuffer(13) // [header:1][id:4][size(set):4][set:4]
      const view = new DataView(buffer)
      view.setUint8(0, MFP_FRAME_TYPES.request << 5 | 0b0010) // request, expected
      view.setUint32(1, 1) // id
      view.setUint32(5, 4) // size(set) = 4 байта (одна запись [key:4])
      view.setUint32(9, 0) // key
      framer.decode(buffer)
    }).toThrowError(/не могут иметь флаг/)

    // Невалидный код service
    expect(() => {
      const message: TMfpService = {
        type: MFP_FRAME_TYPES.service,
        id: isCounter.next(),
        code: 0 as 1, // Невалидный
        refId: isCounter.next(),
        ownRefId: false,
        checksum: false,
        ack: false,
        timeout: false,
        abort: false,
        unknown: false,
        ping: false
      }
      framer.encode(message)
    }).toThrowError(/Код заголовка служебного сообщения/)
  })

  test('MfpFramer: ConfigureError', async () => {
    expect(() => {
      new MfpFramer({ checksumVerification: 1 }) // Нет checksumVerifier
    }).toThrowError(/обязательный параметр 'checksumVerifier'/)
  })
})
