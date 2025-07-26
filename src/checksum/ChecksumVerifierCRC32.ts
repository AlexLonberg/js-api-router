import { errorDetails, PackError } from '../errors.js'
import { ChecksumVerifierLike } from '../interfaces/ChecksumVerifierLike.js'

// Предварительно вычисленная таблица CRC (для скорости)
const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xEDB88320 : 0)
    }
    table[i] = c
  }
  return table
})()

/**
 * Расчитывает контрольную сумму CRC-32 не включая последние 4 байта.
 *
 * @param view Фрейм сообщения с учтенными последними четырьмя байтами.
 */
function calculateCRC32ForFrame (view: DataView): number {
  const length = view.byteLength - 4
  if (length < 0) {
    throw new PackError(errorDetails.PackError('Недостаточный размер фрейма для расчета и записи контрольной суммы.'))
  }
  let crc = 0xFFFFFFFF

  for (let i = 0; i < length; i++) {
    const byte = view.getUint8(i)
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF]!
  }

  return (crc ^ 0xFFFFFFFF) >>> 0 // Приводим к unsigned 32-bit
}

/**
 * Реализует запись и верификацию контрольной суммы `CRC-32`.
 */
class ChecksumVerifierCRC32 extends ChecksumVerifierLike {
  get version (): 'crc32' { return 'crc32' }
  get length (): 4 { return 4 }

  /**
   * Рассчитывает CRC-32 для фрейма, исключая последние 4 байта, и записывает в конец результат.
   *
   * @param view Длина фрейма должна учитывать свободное место для контрольной суммы {@link length}.
   */
  write (view: DataView): void {
    const crc = calculateCRC32ForFrame(view)
    view.setUint32(view.byteLength - 4, crc)
  }

  /**
   * Вычисляет CRC-32, исключая последние 4 байта, и проверяет совпадение с последними байтами.
   *
   * @param view Длина фрейма должна учитывать свободное место для контрольной суммы {@link length}.
   */
  verify (view: DataView): boolean {
    if (view.byteLength < 4) return false
    const storedCRC = view.getUint32(view.byteLength - 4)
    const calculatedCRC = calculateCRC32ForFrame(view)
    return storedCRC === calculatedCRC
  }
}

export {
  ChecksumVerifierCRC32
}
