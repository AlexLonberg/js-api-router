import type { TResponse } from './types.js'
import { ApiRouterError, ConfigureError, errorDetails } from './errors.js'
import type { TEndpointOptionsConfig } from './configs/types.js'
import type { HttpContextLike, THttpContextOptions } from './contexts/Context.js'
import { type EndpointConfig, EndpointOptionsConfig } from './configs/EndpointConfig.js'
import { buildEndpointConfig } from './configs/utils.js'
import { Environment } from './Environment.js'

/**
 * Конфигуратор `endpoints`.
 */
abstract class Endpoints<TConfigKey extends (string | symbol)> {
  protected readonly _internalEndpoints = new Map<TConfigKey, EndpointConfig>()
  protected readonly _internalEnvironment: Environment
  protected readonly _internalConfig: EndpointOptionsConfig

  /**
   * @param env           Общее окружение.
   * @param config        Необязательная конфигурация.
   * @param useSelfTarget Если `true` в конфигурацию будет установлен `{ target: this }`.
   */
  constructor(
    env?: undefined | null | Environment,
    config?: undefined | null | TEndpointOptionsConfig | EndpointOptionsConfig,
    useSelfTarget?: undefined | null | boolean
  ) {
    this._internalEnvironment = env ?? new Environment()
    if (config instanceof EndpointOptionsConfig) {
      if (useSelfTarget) {
        this._internalConfig = this._internalEnvironment.extendsOptionsConfig(config, { target: this })
      }
      else {
        this._internalConfig = config
      }
    }
    else {
      if (useSelfTarget) {
        this._internalConfig = this._internalEnvironment.extendsOptionsConfig(config ?? {}, { target: this })
      }
      else {
        this._internalConfig = this._internalEnvironment.optionsConfig(config ?? {})
      }
    }
  }

  protected _internalBuildConfig (key: TConfigKey): EndpointConfig {
    const cnf = this._internalEndpoints.get(key)
    if (cnf) {
      return cnf
    }
    const ins = buildEndpointConfig(this._internalEnvironment, key, (this as any)[key], this._internalConfig)
    this._internalEndpoints.set(key, ins)
    return ins
  }

  protected async _internalHandleError (options: THttpContextOptions, config: undefined | null | EndpointConfig, e: any): Promise<any> {
    await Promise.resolve()
    if (!(e instanceof ApiRouterError)) {
      e = new ConfigureError(errorDetails.ConfigureError(`Запрос '${options.method}' не был инициализирован и завершился ошибкой.`, e))
    }
    if (config?.handler) {
      config.handler(false, null, e, options.requestId)
    }
    else {
      return { ok: false, value: null, error: e }
    }
  }

  exec<T> (key: TConfigKey, options: THttpContextOptions): any | Promise<TResponse<T>> {
    // Если конфиг уже в кеше, то сам по себе он уже не вызовет ошибку
    let config = this._internalEndpoints.get(key)
    let ctx: HttpContextLike<any>
    try {
      // Если конфиг не собран, запрашиваем сборку
      config ??= this._internalBuildConfig(key)
      // Контекст может получить неверные параметры и упасть
      ctx = config.context.create(config, options) as HttpContextLike<any>
    } catch (e) {
      return this._internalHandleError(options, config, e)
    }
    // Здесь ошибки обрабатываются внутри контекста
    if (config.handler) {
      ctx.run()
    }
    else {
      return ctx.result()
    }
  }
}

export {
  Endpoints
}
