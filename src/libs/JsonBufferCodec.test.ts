import { test, expect } from 'vitest'
import { JsonBufferCodec } from './JsonBufferCodec.js'

test('JsonBufferCodec', () => {
  const codec = new JsonBufferCodec()

  const str = 'Строка.'
  const buff = codec.stringToBuffer(str + '\n' + str)
  const strCopy = codec.bufferToString(buff)

  expect(strCopy).toBe(str + '\n' + str)

  expect(codec.stringToBuffer(strCopy)).toMatchObject(codec.stringToBuffer(str + '\n' + str))
})
