// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ContextLike } from '../interfaces/ContextLike.js'
import {
  Middleware,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type MiddlewareLike,
} from '../interfaces/MiddlewareLike.js'

/**
 * Заглушка для {@link MiddlewareLike}.
 *
 * Этот класс ничего не делает и вызывает для всех методов {@link ContextLike.passthrough()}.
 */
class EmptyMiddleware extends Middleware<any, any> {
  static get kind (): 'empty' { return 'empty' }
  get kind (): string { return 'empty' }
}

export {
  EmptyMiddleware
}
