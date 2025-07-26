import { errorDetails, PackError, UnpackError } from '../errors.js'
import type { JsonLike } from '../types.js'
import { safeToJson } from '../utils.js'

class JsonBufferCodec {
  protected readonly _encoder = new TextEncoder()
  protected readonly _decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

  jsonLikeToString (json: any): string {
    try {
      return JSON.stringify(json)
    } catch (e) {
      throw new PackError(errorDetails.PackError(`Не удалось конвертировать typeof ${safeToJson(typeof json)} к строке.`, e))
    }
  }

  stringToBuffer (str: string): Uint8Array {
    try {
      return this._encoder.encode(str)
    } catch (e) {
      throw new PackError(errorDetails.PackError('Не удалось конвертировать строку к ArrayBuffer.', e))
    }
  }

  jsonLikeToBuffer (json: any): Uint8Array {
    const str = this.jsonLikeToString(json)
    return this.stringToBuffer(str)
  }

  bufferToString (buffer: ArrayBuffer | Uint8Array): string {
    try {
      return this._decoder.decode(buffer)
    } catch (e) {
      throw new UnpackError(errorDetails.UnpackError('Не удалось конвертировать ArrayBuffer к строке.', e))
    }
  }

  bufferToJsonLike<T extends JsonLike> (buffer: ArrayBuffer | Uint8Array): T {
    const str = this.bufferToString(buffer)
    try {
      return JSON.parse(str)
    } catch (e) {
      throw new UnpackError(errorDetails.UnpackError('Не удалось конвертировать ArrayBuffer к JsonLike.', e))
    }
  }
}

export {
  JsonBufferCodec
}
