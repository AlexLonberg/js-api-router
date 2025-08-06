import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type interfaceImplements,
  interfaceDefineHasInstance
} from 'ts-interface-core'

const CHECKSUM_VERIFIER_MARKER = Symbol('CHECKSUM_VERIFIER_MARKER')

/**
 * Вычисляет, записывает и верифицирует контрольные суммы фреймов сообщений.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class ChecksumVerifierLike {
  /**
   * Версия.
   */
  abstract readonly version: string
  /**
   * Размер контрольной суммы в байтах.
   */
  abstract readonly length: number
  /**
   * Рассчитывает контрольную сумму для фрейма, исключая последние {@link length} байт, и записывает в конец результат.
   *
   * @param view Длина фрейма должна учитывать свободное место для контрольной суммы {@link length}.
   */
  abstract write (view: DataView): void
  /**
   * Вычисляет контрольную сумму, исключая последние {@link length} байт, и проверяет совпадение с последними байтами.
   *
   * @param view Длина фрейма должна учитывать свободное место для контрольной суммы {@link length}.
   */
  abstract verify (view: DataView): boolean
}
interfaceDefineHasInstance(ChecksumVerifierLike, CHECKSUM_VERIFIER_MARKER)

/**
 * Заглушка реализации {@link ChecksumVerifierLike}
 */
const checksumVerifierStub: ChecksumVerifierLike = Object.freeze({
  [CHECKSUM_VERIFIER_MARKER]: null,
  version: '',
  length: 0,
  write (_: any) { /**/ },
  verify (_: any) { return true }
} as const)

export {
  ChecksumVerifierLike,
  checksumVerifierStub
}
