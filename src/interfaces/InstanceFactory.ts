import { type interfaceImplements, interfaceDefineHasInstanceMarker } from 'ts-interface-core'

/**
 * Вспомогательная обертка для типов принимающих фабричные функции.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()}.
 */
abstract class InstanceFactory<TIns extends { readonly kind: string }> {
  abstract readonly kind: string
  /***
   * Возвращает экземпляр класса.
   */
  abstract create (): TIns

  /**
   * Оборачивает функцию типом пригодным для передачи в аргументы.
   *
   * @param key
   * @param creator Функция создания объекта.
   */
  static wrap<T extends { readonly kind: string }> (key: string, creator: (() => T)): InstanceFactory<T> {
    return new (class extends InstanceFactory<T> {
      get kind (): string { return key }
      create (): T {
        return creator()
      }
    })
  }
}
interfaceDefineHasInstanceMarker(InstanceFactory)

export {
  InstanceFactory
}
