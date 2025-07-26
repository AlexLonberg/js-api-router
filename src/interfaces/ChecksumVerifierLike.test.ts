import { test, expect } from 'vitest'
import { ChecksumVerifierLike, checksumVerifierStub } from './ChecksumVerifierLike.js'

test('checksumVerifierStub', () => {
  expect(checksumVerifierStub instanceof ChecksumVerifierLike).toBe(true)
})
