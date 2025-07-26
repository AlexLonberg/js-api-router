function headerRecordTo<TName extends string, TValue extends string> (pair: readonly [TName, TValue]): {
  readonly key: TName,
  readonly value: TValue,
  readonly pair: readonly [TName, TValue],
  readonly kv: { readonly [_ in TName]: TValue }
} {
  return {
    get key (): TName {
      return pair[0]
    },
    get value (): TValue {
      return pair[1]
    },
    get pair (): readonly [TName, TValue] {
      return [pair[0], pair[1]]
    },
    get kv (): { readonly [_ in TName]: TValue } {
      return { [pair[0]]: pair[1] } as { readonly [_ in TName]: TValue }
    }
  }
}

/**
 * Небольшой список часто-используемых заголовков.
 */
const headersSet = Object.freeze({
  contentType: Object.freeze({
    text: headerRecordTo(['content-type', 'plain/text; charset=utf-8']),
    html: headerRecordTo(['content-type', 'text/html; charset=utf-8']),
    markdown: headerRecordTo(['content-type', 'text/markdown; charset=utf-8']),
    js: headerRecordTo(['content-type', 'text/javascript; charset=utf-8']),
    css: headerRecordTo(['content-type', 'text/css; charset=utf-8']),
    json: headerRecordTo(['content-type', 'application/json; charset=utf-8']),
    imagePng: headerRecordTo(['content-type', 'image/png']),
    imageJpeg: headerRecordTo(['content-type', 'image/jpeg']),
    imageWebp: headerRecordTo(['content-type', 'image/webp']),
    imageBmp: headerRecordTo(['content-type', 'image/bmp']),
    imageGif: headerRecordTo(['content-type', 'image/gif']),
    imageIco: headerRecordTo(['content-type', 'image/x-icon']),
    imageSvgXml: headerRecordTo(['content-type', 'image/svg+xml; charset=utf-8']),
    //
    mfp: headerRecordTo(['content-type', 'mfp']),
  })
})

export {
  headerRecordTo,
  headersSet
}
