import { errorDetails, UnpackError, StatusError } from '../errors.js'
import { safeToJson } from '../utils.js'
import type { HttpContext } from '../contexts/HttpContext.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'

const _reImageContent = /image\/(png|jpeg|webp|bmp)/i

function isContentTypeImage (response: { headers: Headers }): boolean {
  const value = response.headers.get('content-type')
  return value ? _reImageContent.test(value) : false
}

class BlobImageResponseMiddleware extends Middleware<Response, Blob> {
  static get kind (): 'BlobImageResponseMiddleware' { return 'BlobImageResponseMiddleware' }
  get kind (): 'BlobImageResponseMiddleware' { return 'BlobImageResponseMiddleware' }

  protected _throwResponseStatusError (ctx: HttpContext<any, any>, response: Response): never {
    throw new StatusError(errorDetails.StatusError(response.status, ctx.url.toString()))
  }

  protected _throwResponseTypeError (ctx: HttpContext<any, any>, response: Response): never {
    const value = response.headers.get('content-type')
    const detail = errorDetails.UnpackError(`Ожидался 'image/*', получен 'Content-Type: ${safeToJson(value)}'.`)
    detail.url = ctx.url.toString()
    throw new UnpackError(detail)
  }

  override async process (ctx: HttpContext<any, any>, response: Response): Promise<Blob> {
    if (!response.ok) {
      this._throwResponseStatusError(ctx, response)
    }
    if (!isContentTypeImage(response)) {
      this._throwResponseTypeError(ctx, response)
    }
    try {
      return await response.blob()
    } catch (e) {
      const detail = errorDetails.UnpackError('Чтение Response.blob() завершилось ошибкой', e)
      detail.url = ctx.url.toString()
      throw new UnpackError(detail)
    }
  }
}

export {
  isContentTypeImage,
  BlobImageResponseMiddleware
}
