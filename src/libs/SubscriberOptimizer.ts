import type { AnyFunction } from '../types.js'

const OPTIMIZER = Symbol('OPTIMIZER')

abstract class SubscriberOptimizer<TFn extends AnyFunction> {
  abstract on (callback: TFn): void
  abstract off (callback: TFn): void

  static safe<TFn extends AnyFunction> (callback: TFn, ...args: any[]): void {
    try {
      callback(...args)
    } catch (e) {
      console.error(e)
    }
  }

  static wrap<TFn extends AnyFunction> (callback: TFn, ...fns: AnyFunction[]): (SubscriberOptimizer<TFn> & TFn) {
    const listeners: AnyFunction[] = [callback]
    const fun = (...args: any[]) => {
      for (const cb of listeners) {
        try {
          cb(...args)
        } catch (e) {
          console.error(e)
        }
      }
    }
    fun[OPTIMIZER] = true
    fun.on = (fn: AnyFunction) => {
      if (!listeners.includes(fn)) {
        listeners.push(fn)
      }
    }
    fun.off = (fn: AnyFunction) => {
      for (let i = 0; i < listeners.length; ++i) {
        if (listeners[i] === fn) {
          listeners.splice(i, 1)
          break
        }
      }
    }
    for (const item of fns) {
      fun.on(item)
    }
    return fun as unknown as (SubscriberOptimizer<TFn> & TFn)
  }

  static instanceOf<TFn extends AnyFunction> (fn: TFn): fn is (SubscriberOptimizer<TFn> & TFn) {
    return (OPTIMIZER in fn)
  }
}

export {
  SubscriberOptimizer
}
