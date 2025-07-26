import { isNonemptyString, safeToJson } from '../utils.js'
import { ConfigureError, errorDetails } from '../errors.js'
import { RegistryBase } from '../libs/RegistryBase.js'
import type { EndpointConfig, EndpointPresetConfig, TEndpointConfigConstructor } from './EndpointConfig.js'

/**
 * Реестр глобально зарегистрированных специализированных конструкторов классов конфигураций конечных точек {@link EndpointConfig}.
 */
class EndpointConfigRegistry extends RegistryBase<string, TEndpointConfigConstructor<any>> {
  /**
   * Регистрирует уникальный конструктор конфигурации конечной точки.
   *
   * @param configConstructor Конструктор {@link EndpointConfig}.
   */
  register (configConstructor: TEndpointConfigConstructor<any>): void {
    if (this._frozen) {
      throw new ConfigureError(errorDetails.ConfigureError(`EndpointConfigRegistry заморожен и не может зарегистрировать новый тип EndpointConfig ${safeToJson(configConstructor.kind)}.`))
    }
    if (!isNonemptyString(configConstructor.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Именем конструктора EndpointConfig должна быть непустая строка, получено: ${safeToJson(configConstructor.kind)}.`))
    }
    if (this._items.has(configConstructor.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Конструктор EndpointConfig "${configConstructor.kind}" уже зарегистрирован.`))
    }
    this._items.set(configConstructor.kind, configConstructor)
  }

  /**
   * Возвращает конструктор класса по `kind` или вызывает ошибку.
   */
  getOrThrow<T extends EndpointConfig> (kind: string): TEndpointConfigConstructor<T> {
    const cls = this._items.get(kind)
    if (!cls) {
      throw new ConfigureError(errorDetails.ConfigureError(`Конструктор EndpointConfig ${safeToJson(kind)} не зарегистрирован.`))
    }
    return cls
  }
}

/**
 * Реестр пресетов {@link EndpointPresetConfig}.
 */
class PresetConfigRegistry extends RegistryBase<string, EndpointPresetConfig> {
  register (name: string, config: EndpointPresetConfig): void {
    if (this._frozen) {
      throw new ConfigureError(errorDetails.ConfigureError(`PresetConfigRegistry заморожен и не может зарегистрировать новый EndpointPresetConfig ${safeToJson(name)}.`))
    }
    if (!isNonemptyString(name)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Именем EndpointPresetConfig должна быть непустая строка, получено: ${safeToJson(name)}.`))
    }
    if (this._items.has(name)) {
      throw new ConfigureError(errorDetails.ConfigureError(`EndpointPresetConfig "${name}" уже зарегистрирован.`))
    }
    this._items.set(name, config)
  }

  getOrThrow (name: string): EndpointPresetConfig {
    const cfg = this._items.get(name)
    if (!cfg) {
      throw new ConfigureError(errorDetails.ConfigureError(`EndpointPresetConfig ${safeToJson(name)} не зарегистрирован.`))
    }
    return cfg
  }
}

export {
  EndpointConfigRegistry,
  PresetConfigRegistry
}
