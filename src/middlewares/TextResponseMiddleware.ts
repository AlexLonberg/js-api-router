
import { errorDetails, UnpackError, StatusError } from '../errors.js'
import { safeToJson } from '../utils.js'
import type { HttpContext } from '../contexts/HttpContext.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'

const _reTextPlain = /text\/plain/i

function isContentTypeText (response: { headers: Headers }): boolean {
  const value = response.headers.get('content-type')
  return value ? _reTextPlain.test(value) : false
}

class TextResponseMiddleware extends Middleware<Response, string> {
  static get kind (): 'TextResponseMiddleware' { return 'TextResponseMiddleware' }
  get kind (): 'TextResponseMiddleware' { return 'TextResponseMiddleware' }

  protected _throwResponseStatusError (ctx: HttpContext<any, any>, response: Response): never {
    throw new StatusError(errorDetails.StatusError(response.status, ctx.url.toString()))
  }

  protected _throwResponseTypeError (ctx: HttpContext<any, any>, response: Response): never {
    const value = response.headers.get('content-type')
    const detail = errorDetails.UnpackError(`Ожидался 'text/plain', получен 'Content-Type: ${safeToJson(value)}'.`)
    detail.url = ctx.url.toString()
    throw new UnpackError(detail)
  }

  override async process (ctx: HttpContext<any, any>, response: Response): Promise<string> {
    if (!response.ok) {
      this._throwResponseStatusError(ctx, response)
    }
    if (!isContentTypeText(response)) {
      this._throwResponseTypeError(ctx, response)
    }
    try {
      return await response.text()
    } catch (e) {
      const detail = errorDetails.UnpackError('Чтение Response.text() завершилось ошибкой', e)
      detail.url = ctx.url.toString()
      throw new UnpackError(detail)
    }
  }

  override async processError (ctx: HttpContext<any, any>, response: any, error: any): Promise<any> {
    if ((error instanceof StatusError) && (response instanceof Response) && isContentTypeText(response)) {
      let body: any
      try {
        body = await response.text()
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
  isContentTypeText,
  TextResponseMiddleware
}
