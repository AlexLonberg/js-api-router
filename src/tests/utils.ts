import { join } from 'node:path'
import { type Dirent, readdirSync, rmSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

/**
 * Функция для получения хеша файла
 */
function getFileHash (filePath: string, algorithm: string = 'sha256'): string {
  const fileBuffer = readFileSync(filePath)
  const hashSum = createHash(algorithm)
  hashSum.update(fileBuffer)
  return hashSum.digest('hex')
}

/**
 * Очищает файлы/папки внутри каталога
 */
function clearDir (path: string): null | boolean {
  let files: Dirent[]
  try {
    files = readdirSync(path, { encoding: 'utf8', withFileTypes: true })
  } catch (_) {
    return null
  }
  let noError = true
  for (const dirent of files) {
    try {
      if (dirent.isDirectory()) rmSync(join(path, dirent.name), { force: true, recursive: true })
      else rmSync(join(path, dirent.name), { force: true })
    } catch (_) {
      noError = false
    }
  }
  return noError
}

/**
 * Вспомогательная функция преобразующая `Buffer` полученный в node `'ws'` в `ArrayBuffer` пригодный для MFP.
 *
 * @param rawData Данные полученный из `ws.on('message', function message (rawData: RawData, isBinary: boolean)`
 */
function nodeBufferToArrayBuffer (rawData: any): ArrayBuffer {
  const binaryData = rawData as unknown as Buffer
  const uint8 = new Uint8Array(binaryData.buffer, binaryData.byteOffset, binaryData.byteLength)
  return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
}

export {
  getFileHash,
  clearDir,
  nodeBufferToArrayBuffer
}
