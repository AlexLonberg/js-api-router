import { isNullish, isString } from '../utils.js'
import type { HttpContext } from '../contexts/HttpContext.js'
import { Middleware } from '../interfaces/MiddlewareLike.js'

/**
 * Универсальный обработчик запроса {@link fetch()}.
 *
 * **Замечание:** Для повышения производительности и в более специализированных сценариях рассмотрите возможность
 * использования специализированных обработчиков. Универсальный обработчик не знает о теле запроса, вынужден
 * идентифицировать тип и может менять заголовки.
 *
 * Как обрабатывается тело запроса?:
 *
 *   1. Проверяется тип запроса `POST` и входящее значение, которое не должно быть равно `undefined | null`.
 *   2. Определяется допустимый тип и, если он не {@link BodyInit}, объект приводится к `json`.
 *   3. Для тела запроса {@link FormData} или {@link URLSearchParams} удаляется заголовок `Content-Type`.
 *   4. ... никаких других действий не производится и возвращается `Promise<Response>`.
 */
class HttpRequestMiddleware extends Middleware<any, Response> {
  static get kind (): 'http' { return 'http' }
  get kind (): 'http' { return 'http' }

  override process (ctx: HttpContext<any, any>, data: any): Promise<Response> {
    if (ctx.method === 'POST' && !isNullish(data)) {
      // FormData - браузер самостоятельно установит заголовок content-type и границу multipart/form-data
      // URLSearchParams - автоматически устанавливает `content-type: application/x-www-form-urlencoded`,
      //   и ручная установка заголовка может привести к конфликту формата.
      if ((data instanceof FormData) || (data instanceof URLSearchParams)) {
        ctx.headers.delete('content-type')
        ctx.requestInit.body = data
      }
      else if (
        isString(data) ||
        (data instanceof ReadableStream) ||
        (data instanceof Blob) ||
        ArrayBuffer.isView(data) || // ArrayBufferView
        (data instanceof ArrayBuffer)
      ) {
        ctx.requestInit.body = data
      }
      else {
        ctx.requestInit.body = JSON.stringify(data)
      }
    }
    else {
      ctx.requestInit.body = null
    }
    return fetch(ctx.url.toString(), ctx.requestInit.toCompatibleType())
  }
}

export {
  HttpRequestMiddleware
}
