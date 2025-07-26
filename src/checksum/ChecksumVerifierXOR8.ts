import { errorDetails, PackError } from '../errors.js'
import { ChecksumVerifierLike } from '../interfaces/ChecksumVerifierLike.js'

/**
 * Реализует простой и очень быстрый алгоритм проверки целостности на основе XOR.
 *
 * Использует 8-битную (1 байт) контрольную сумму. Идеально подходит для
 * высокопроизводительных сценариев в надежных сетях (localhost, LAN), где CRC32 избыточен.
 */
class ChecksumVerifierXOR8 extends ChecksumVerifierLike {
  get version (): 'xor8' { return 'xor8' }
  get length (): 1 { return 1 } // 8-битная (1 байт) контрольная сумма

  /**
   * Рассчитывает XOR-сумму для всех байт фрейма (кроме последнего)
   * и записывает результат в последний байт.
   *
   * @param view DataView фрейма. Длина должна быть >= 1.
   */
  public write (view: DataView): void {
    if (view.byteLength < 1) {
      // Этого не должно происходить в реальных условиях, но защита не помешает
      throw new PackError(errorDetails.PackError(`Buffer too small for XOR checksum. Minimum size: ${this.length} byte(s).`))
    }

    const dataLength = view.byteLength - 1
    let checksum = 0

    for (let i = 0; i < dataLength; i++) {
      checksum ^= view.getUint8(i)
    }

    view.setUint8(dataLength, checksum)
  }

  /**
   * Проверяет, совпадает ли XOR-сумма данных фрейма со значением,
   * записанным в последнем байте.
   *
   * @param view DataView фрейма. Длина должна быть >= 1.
   * @returns `true`, если контрольная сумма верна, иначе `false`.
   */
  public verify (view: DataView): boolean {
    if (view.byteLength < 1) {
      return false
    }

    const dataLength = view.byteLength - 1
    let calculatedChecksum = 0

    for (let i = 0; i < dataLength; i++) {
      calculatedChecksum ^= view.getUint8(i)
    }

    const storedChecksum = view.getUint8(dataLength)

    return calculatedChecksum === storedChecksum
  }
}

export {
  ChecksumVerifierXOR8
}
