import { describe, beforeEach, test, expect } from 'vitest'
import type { TPositiveInteger } from '../types.js'
import { ChecksumVerifierXOR8 } from '../checksum/ChecksumVerifierXOR8.js'
import { MFP_FRAME_TYPES, MFP_SERVICE_CODES } from '../mfp/types.js'
import {
  type TMdpFileContainer,
  type TMdpServiceOptions,
  // type TMdpMessageBaseOptions,
  type TMdpRequestOptions,
  type TMdpMessageOptions,
  type TMdpResponseOptions,
  type TMdpAnnounceOptions,
  type TMdpBinaryOptions,
  // type TMdpDecodedBase,
  // type TMdpDecodedPartData,
  // type TMdpDecodedPartFiles,
  // type TMdpDecodedPartError,
  // type TMdpDecodedPartRefId,
  // type TMdpDecodedPartNeedAck,
  type TMdpDecodedService,
  type TMdpDecodedMessage,
  type TMdpDecodedBinary,
  type TMdpDecodedRequest,
  type TMdpDecodedResponse,
  // type TMdpDecodedData
} from './types.js'
import {
  type TMdpFramerOptions,
  MdpFramer
} from './MdpFramer.js'

test('MdpFramer', () => {
  const options: TMdpFramerOptions = {
    maxIncomingFiles: 10,
    maxOutgoingFiles: 10,
    checksumVerification: 1,
    checksumVerifier: new ChecksumVerifierXOR8()
  }
  const framer = new MdpFramer(options)

  const message: TMdpMessageOptions = {
    data: { hello: 'world!' },
    files: new Map([[0, { name: 'any', type: 'any', bin: new ArrayBuffer(10) }]]),
    checksum: true
  }
  const expected: TMdpDecodedMessage = {
    type: MFP_FRAME_TYPES.message,
    id: 1,
    endpoint: 'service',
    data: { hello: 'world!' },
    files: new Map([[0, { name: 'any', type: 'any', bin: new ArrayBuffer(10) }]]),
    error: null,
    expected: null,
    streaming: false,
    needAck: false,
    checksum: true
  }

  const frame = framer.encodeMessage('service', message)
  const decoded = framer.decode(frame)
  // Здесь нельзя применять toStrictEqual, в сообщении могут быть затертые поля binaries
  expect(decoded).toMatchObject(expected)
})

describe('MdpFramer', () => {
  let framer: MdpFramer

  beforeEach(() => {
    const options: TMdpFramerOptions = {
      maxIncomingFiles: 10,
      maxOutgoingFiles: 10,
      checksumVerification: 1,
      checksumVerifier: new ChecksumVerifierXOR8()
    }
    framer = new MdpFramer(options)
  })

  test('encodeService and decode', () => {
    const options: TMdpServiceOptions = {
      code: MFP_SERVICE_CODES.ack,
      refId: 1,
      ownRefId: true,
      checksum: true
    }
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.ack,
      refId: 1,
      ownRefId: true,
      ack: true,
      timeout: false,
      abort: false,
      unknown: false,
      ping: false,
      checksum: true
    }
    const frame = framer.encodeService(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeServiceAck and decode', () => {
    const options: Omit<TMdpServiceOptions, 'code'> = {
      refId: 1,
      ownRefId: true,
      checksum: true
    }
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.ack,
      refId: 1,
      ownRefId: true,
      ack: true,
      timeout: false,
      abort: false,
      unknown: false,
      ping: false,
      checksum: true
    }
    const frame = framer.encodeServiceAck(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeServiceTimeout and decode', () => {
    const options: Omit<TMdpServiceOptions, 'code'> = {
      refId: 1,
      ownRefId: false,
      checksum: true
    }
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.timeout,
      refId: 1,
      ownRefId: false,
      ack: false,
      timeout: true,
      abort: false,
      unknown: false,
      ping: false,
      checksum: true
    }
    const frame = framer.encodeServiceTimeout(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeServiceAbort and decode', () => {
    const options: Omit<TMdpServiceOptions, 'code'> = {
      refId: 1,
      ownRefId: false,
      checksum: true
    }
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.abort,
      refId: 1,
      ownRefId: false,
      ack: false,
      timeout: false,
      abort: true,
      unknown: false,
      ping: false,
      checksum: true
    }
    const frame = framer.encodeServiceAbort(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeServiceUnknown and decode', () => {
    const options: Omit<TMdpServiceOptions, 'code'> = {
      refId: 1,
      ownRefId: false,
      checksum: true
    }
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.unknown,
      refId: 1,
      ownRefId: false,
      ack: false,
      timeout: false,
      abort: false,
      unknown: true,
      ping: false,
      checksum: true
    }
    const frame = framer.encodeServiceUnknown(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeServicePing and decode', () => {
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.ping,
      refId: 1,
      ownRefId: true,
      ack: false,
      timeout: false,
      abort: false,
      unknown: false,
      ping: true,
      checksum: true
    }
    const frame = framer.encodeServicePing(true)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeMessage and decode', () => {
    const file1: TMdpFileContainer = { name: 'file1.txt', type: 'text/plain', bin: new ArrayBuffer(10) }
    const file2: TMdpFileContainer = { name: 'file2.bin', type: 'application/octet-stream', bin: new ArrayBuffer(0) }
    const options: TMdpMessageOptions = {
      data: { hello: 'world' },
      files: new Map([[0, file1], [1, file2]]),
      error: { code: 400, message: 'Bad Request' },
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedMessage = {
      type: MFP_FRAME_TYPES.message,
      id: 1,
      endpoint: 'service',
      data: { hello: 'world' },
      files: new Map([[0, file1], [1, file2]]),
      error: { code: 400, message: 'Bad Request' },
      expected: null,
      streaming: false,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeMessage('service', options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeRequest and decode', () => {
    const file1: TMdpFileContainer = { name: 'file1.txt', type: 'text/plain', bin: new ArrayBuffer(10) }
    const options: TMdpRequestOptions = {
      data: { action: 'getData' },
      files: new Map([[0, file1]]),
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedRequest = {
      type: MFP_FRAME_TYPES.request,
      id: 1,
      endpoint: 'service',
      data: { action: 'getData' },
      files: new Map([[0, file1]]),
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeRequest('service', options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeResponse and decode', () => {
    const file1: TMdpFileContainer = { name: 'file1.txt', type: 'text/plain', bin: new ArrayBuffer(10) }
    const options: TMdpResponseOptions = {
      data: { result: 'success' },
      files: new Map([[0, file1]]),
      error: { code: 200, message: 'OK' },
      refId: 1,
      needAck: false,
      checksum: true
    }
    const expected: TMdpDecodedResponse = {
      type: MFP_FRAME_TYPES.response,
      id: 1,
      endpoint: 'service',
      data: { result: 'success' },
      files: new Map([[0, file1]]),
      error: { code: 200, message: 'OK' },
      refId: 1,
      needAck: false,
      checksum: true
    }
    const frame = framer.encodeResponse('service', options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeAnnounce with expected and decode', () => {
    const options: TMdpAnnounceOptions = {
      data: { announce: 'files' },
      expected: new Set([0, 1]),
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedMessage = {
      type: MFP_FRAME_TYPES.message,
      id: 1,
      endpoint: 'service',
      data: { announce: 'files' },
      files: null,
      error: null,
      expected: new Set([0, 1]),
      streaming: false,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeAnnounce('service', options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeAnnounce with streaming and decode', () => {
    const options: TMdpAnnounceOptions = {
      data: { announce: 'stream' },
      expected: new Set(),
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedMessage = {
      type: MFP_FRAME_TYPES.message,
      id: 1,
      endpoint: 'service',
      data: { announce: 'stream' },
      files: null,
      error: null,
      expected: null,
      streaming: true,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeAnnounce('service', options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeBinary with hasExpected and decode', () => {
    const options: TMdpBinaryOptions = {
      refId: 1,
      hasExpected: true,
      key: 0,
      bin: new ArrayBuffer(10),
      final: false,
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: 1,
      refId: 1,
      hasExpected: true,
      hasStreaming: false,
      hasData: false,
      key: 0,
      bin: new ArrayBuffer(10),
      final: false,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeBinary(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeBinary with hasStreaming and decode', () => {
    const options: TMdpBinaryOptions = {
      refId: 1,
      hasStreaming: true,
      key: 0,
      bin: new ArrayBuffer(0),
      final: true,
      needAck: true,
      checksum: true
    }
    const expected: TMdpDecodedBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: 1,
      refId: 1,
      hasExpected: false,
      hasStreaming: true,
      hasData: false,
      key: 0,
      bin: new ArrayBuffer(0),
      final: true,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeBinary(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeBinary with hasData and decode', () => {
    const options: TMdpBinaryOptions = {
      refId: 1,
      hasData: true,
      needAck: true,
      checksum: true,
      bin: new ArrayBuffer(10)
    }
    const expected: TMdpDecodedBinary = {
      type: MFP_FRAME_TYPES.binary,
      id: 1,
      refId: 1,
      hasData: true,
      hasExpected: false,
      hasStreaming: false,
      key: 0,
      bin: new ArrayBuffer(10),
      final: false,
      needAck: true,
      checksum: true
    }
    const frame = framer.encodeBinary(options)
    const decoded = framer.decode(frame)
    expect(decoded).toMatchObject(expected)
  })

  test('encodeBinary without key', () => {
    const options: TMdpBinaryOptions = {
      refId: 1,
      hasStreaming: true,
      bin: new ArrayBuffer(10)
    }
    expect(() => framer.encodeBinary(options)).toThrowError(/Ключ бинарных данных должен находится в диапазоне/)
  })

  test('decodedServiceSelfAck', () => {
    const expected: TMdpDecodedService = {
      type: MFP_FRAME_TYPES.service,
      id: 1,
      code: MFP_SERVICE_CODES.ack,
      refId: 1,
      ownRefId: true,
      ack: true,
      timeout: false,
      abort: false,
      unknown: false,
      ping: false,
      checksum: false
    }
    const decoded = framer.decodedServiceSelfAck(1 as TPositiveInteger)
    expect(decoded).toMatchObject(expected)
  })

  test('decode with invalid endpoint throws UnpackError', () => {
    // Модифицируем data, чтобы endpoint был некорректным
    const mfpFrame = framer.framer.encodeMessage({
      id: 1,
      data: framer.codec.jsonLikeToBuffer({ endpoint: '' }),
      binaries: null,
      expected: null,
      streaming: false,
      needAck: false,
      checksum: true,
    })
    expect(() => framer.decode(mfpFrame)).toThrowError(/не имеет обязательного поля 'endpoint:string'/)
  })

  test('decode with invalid filemap throws UnpackError', () => {
    // Модифицируем filemap, чтобы он был некорректным
    const mfpFrame = framer.framer.encodeMessage({
      id: 1,
      data: framer.codec.jsonLikeToBuffer({ endpoint: 'service', filemap: [[0, 'file1.txt']] }), // Некорректный формат
      binaries: new Map([[0, new ArrayBuffer(10)]]),
      expected: null,
      streaming: false,
      needAck: false,
      checksum: true
    })
    expect(() => framer.decode(mfpFrame)).toThrowError(/должна быть в формате '\[number, string, string\]\[]'/)
  })

  test('decode with duplicate filemap keys throws UnpackError', () => {
    // Модифицируем filemap, чтобы добавить дубликат ключа
    const mfpFrame = framer.framer.encodeMessage({
      id: 1,
      data: framer.codec.jsonLikeToBuffer({ endpoint: 'service', filemap: [[0, 'file1.txt', 'text/plain'], [0, 'file2.txt', 'text/plain']] }),
      binaries: new Map([[0, new ArrayBuffer(10)], [1, new ArrayBuffer(10)]]),
      expected: null,
      streaming: false,
      needAck: false,
      checksum: true
    })
    expect(() => framer.decode(mfpFrame)).toThrowError(/имеет дубликал ключа/)
  })

  test('decode with missing filemap key throws UnpackError', () => {
    // Модифицируем filemap, чтобы указать несуществующий ключ
    const mfpFrame = framer.framer.encodeMessage({
      id: 1,
      data: framer.codec.jsonLikeToBuffer({ endpoint: 'service', filemap: [[999, 'file1.txt', 'text/plain']] }),
      binaries: new Map([[0, new ArrayBuffer(10)]]),
      expected: null,
      streaming: false,
      needAck: false,
      checksum: true
    })
    expect(() => framer.decode(mfpFrame)).toThrowError(/Не найден файл с ключом/)
  })
})
