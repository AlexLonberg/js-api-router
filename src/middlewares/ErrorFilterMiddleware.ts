import type { ApiRouterError } from '../errors.js'
import { isFunction } from '../utils.js'
import type { ContextLike } from '../interfaces/ContextLike.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'

class ErrorFilterMiddleware<TIn, TOut> extends Middleware<TIn, TOut> {
  static get kind (): 'ErrorFilterMiddleware' { return 'ErrorFilterMiddleware' }
  get kind (): 'ErrorFilterMiddleware' { return 'ErrorFilterMiddleware' }

  protected readonly _errorClasses = new Set<new (..._: any[]) => ApiRouterError>()

  constructor(errors?: undefined | null | Iterable<new (..._: any[]) => ApiRouterError>) {
    super()
    if (errors) {
      this.add(...errors)
    }
  }

  add (...errors: (new (..._: any[]) => ApiRouterError)[]): void {
    for (const cls of errors) {
      if (isFunction(cls)) {
        this._errorClasses.add(cls)
      }
    }
  }

  override processError (ctx: ContextLike, _value: any, error: any): any {
    for (const cls of this._errorClasses) {
      if (error instanceof cls) {
        throw error
      }
    }
    return ctx.passthrough()
  }
}

export {
  ErrorFilterMiddleware
}
