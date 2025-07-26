import { safeToJson } from '../utils.js'
import { errorDetails, StatusError, UnpackError } from '../errors.js'
import type { JsonLike } from '../types.js'
import type { HttpContext } from '../contexts/HttpContext.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'

const _reJsonContentType = /(application|text)\/json/i

/**
 * Проверяет заголовок `content-type` регулярным выражением `/(application|text)\/json/i`.
 */
function isJsonContentType (response: Response): boolean {
  const contentType = response.headers.get('content-type')
  return contentType ? _reJsonContentType.test(contentType) : false
}

class JsonResponseMiddleware extends Middleware<Response, JsonLike> {
  static get kind (): 'JsonResponseMiddleware' { return 'JsonResponseMiddleware' }
  get kind (): string { return 'JsonResponseMiddleware' }

  protected _throwResponseStatusError (ctx: HttpContext<any, any>, response: Response): never {
    throw new StatusError(errorDetails.StatusError(response.status, ctx.url.toString()))
  }

  protected _throwResponseTypeError (ctx: HttpContext<any, any>, response: Response): never {
    const value = response.headers.get('content-type')
    const detail = errorDetails.UnpackError(`Ожидался 'application/json', получен 'Content-Type: ${safeToJson(value)}'.`)
    detail.url = ctx.url.toString()
    throw new UnpackError(detail)
  }

  override async process (ctx: HttpContext<any, any>, response: Response): Promise<JsonLike> {
    if (!response.ok) {
      this._throwResponseStatusError(ctx, response)
    }
    if (!isJsonContentType(response)) {
      this._throwResponseTypeError(ctx, response)
    }
    try {
      return await response.json()
    } catch (e) {
      const detail = errorDetails.UnpackError('Чтение Response.json() завершилось ошибкой', e)
      detail.url = ctx.url.toString()
      throw new UnpackError(detail)
    }
  }

  override async processError (ctx: HttpContext<any, any>, response: any, error: any): Promise<any> {
    if ((error instanceof StatusError) && (response instanceof Response) && isJsonContentType(response)) {
      let body: any
      try {
        body = await response.json()
      } catch (_) {
        return ctx.passthrough()
      }
      error.detail.data = body
      throw error
    }
    return ctx.passthrough()
  }
}

export {
  isJsonContentType,
  JsonResponseMiddleware
}
