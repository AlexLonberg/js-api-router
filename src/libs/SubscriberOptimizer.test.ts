import { test, expect } from 'vitest'
import { uselessFunctionStub_ } from '../types.js'
import { SubscriberOptimizer } from './SubscriberOptimizer.js'

test('SubscriberOptimizer', () => {
  const result: any[] = []

  function callback1 (value1: any, value2: any) {
    result.push(value1, value2)
  }
  function callback2 (value1: any, value2: any) {
    result.push(value1, value2)
  }

  type TFn = ((value1: any, value2: any) => any)

  class Foo {
    private _callback: TFn
    constructor(callback: TFn) {
      this._callback = callback
    }

    emit (value1: any, value2: any): void {
      if (SubscriberOptimizer.instanceOf(this._callback)) {
        this._callback(value1, value2)
      }
      else {
        SubscriberOptimizer.safe(this._callback, value1, value2)
      }
    }

    on (callback: TFn): void {
      if (SubscriberOptimizer.instanceOf(this._callback)) {
        this._callback.on(callback)
      }
      else {
        this._callback = SubscriberOptimizer.wrap(this._callback, callback)
      }
    }

    off (callback: TFn) {
      if (SubscriberOptimizer.instanceOf(this._callback)) {
        this._callback.off(callback)
      }
      else if (this._callback === callback) {
        this._callback = uselessFunctionStub_
      }
    }
  }

  const ins = new Foo(callback1)
  ins.emit(1, 2)
  ins.on(callback2)
  ins.emit(3, 4)
  ins.off(callback1)
  ins.emit(5, 6)
  ins.off(callback2)
  ins.emit(7, 8)

  expect(result).toStrictEqual([1, 2, 3, 4, 3, 4, 5, 6])
})
