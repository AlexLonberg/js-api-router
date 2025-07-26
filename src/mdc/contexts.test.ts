import { test, expect } from 'vitest'
import type { TPositiveInteger, TNonemptyString } from '../types.js'
import { mdpEndpointCreateErrorContext } from './contexts.js'
import {
  MDP_ENDPOINT_CONTEXT_STATUS_CODES,
  MdpEndpointContextLike,
  MdpEndpointAckContextLike,
  MdpEndpointRequestContextLike,
  MdpEndpointResponseContextLike,
} from './types.js'

test('mdpEndpointCreateErrorContext', () => {
  const ctx1 = mdpEndpointCreateErrorContext(0, 1 as TPositiveInteger, 'name' as TNonemptyString, MDP_ENDPOINT_CONTEXT_STATUS_CODES.pack, null)
  const ctx2 = mdpEndpointCreateErrorContext(1, 2 as TPositiveInteger, 'name' as TNonemptyString, MDP_ENDPOINT_CONTEXT_STATUS_CODES.error, null)

  expect(ctx1).toBeInstanceOf(MdpEndpointContextLike)
  expect(ctx1).toBeInstanceOf(MdpEndpointAckContextLike)
  expect(ctx2).toBeInstanceOf(MdpEndpointContextLike)
  expect(ctx2).toBeInstanceOf(MdpEndpointResponseContextLike)

  expect(ctx1).not.toBeInstanceOf(MdpEndpointResponseContextLike)
  expect(ctx1).not.toBeInstanceOf(MdpEndpointRequestContextLike)

  expect(ctx2).toBeInstanceOf(MdpEndpointContextLike)
  expect(ctx2).toBeInstanceOf(MdpEndpointResponseContextLike)
  expect(ctx2).not.toBeInstanceOf(MdpEndpointAckContextLike)
  expect(ctx2).not.toBeInstanceOf(MdpEndpointRequestContextLike)
})
