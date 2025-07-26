import { test, expect } from 'vitest'
import { freezeMap } from './utils.js'

test('freezeMap', () => {
  const regular = new Map([['key', 'regular']])
  const frozen = Object.freeze(new Map([['key', 'frozen']]))
  const sealed = Object.seal(new Map([['key', 'sealed']]))
  const nonext = Object.preventExtensions(new Map([['key', 'nonext']]))

  const regularFrozen = freezeMap(regular)
  const frozenFrozen = freezeMap(frozen)
  const sealedFrozen = freezeMap(sealed)
  const nonextFrozen = freezeMap(nonext)

  // @ts-expect-error Property 'clear' does not exist on type 'ReadonlyMap<string, string>'
  regularFrozen.clear()
  // @ts-expect-error
  frozenFrozen.clear()
  // @ts-expect-error
  sealedFrozen.clear()
  // @ts-expect-error
  nonextFrozen.clear()

  // Сработает обычный Map
  expect(regularFrozen.size).toBe(1)
  // ... замороженные, запечатанные и нерасширяемые - не смогут переопределить свойста
  expect(frozenFrozen.size).toBe(0)
  expect(sealedFrozen.size).toBe(0)
  expect(nonextFrozen.size).toBe(0)
})
