import type { UOptional } from './types.js'
import { isNonemptyString, isObject, isPlainObject, safeToJson } from './utils.js'
import { NamedAsyncQueue } from './libs/AsyncQueue.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MiddlewareLike } from './interfaces/MiddlewareLike.js'
import type { ContextLike, TContextConstructor } from './interfaces/ContextLike.js'
import type {
  TEndpointOptionsConfig,
  TEndpointPresetConfig,
  TEndpointNormalizedPresetConfig,
  TEndpointNormalizedOptionsConfig
} from './configs/types.js'
import {
  createEndpointOptionsConfig,
  createEndpointPresetConfig,
  extendsEndpointConfigs
} from './configs/utils.js'
import { EndpointConfigRegistry, PresetConfigRegistry } from './configs/registries.js'
import type { TRequestInitExtendsMode } from './configs/RequestInitConfig.js'
import type { THeadersAppendMode, THeadersExtendsMode } from './configs/HeadersConfig.js'
import type { TUrlQueryAppendMode, TUrlQueryExtendsMode } from './configs/UrlQueryParams.js'
import type { TUrlHashExtendsMode } from './configs/UrlConfig.js'
import {
  type EndpointConfig,
  type TEndpointConfigConstructor,
  EndpointOptionsConfig,
  EndpointPresetConfig
} from './configs/EndpointConfig.js'
import { EndpointHttpConfig } from './configs/EndpointHttpConfig.js'
import { type TMiddlewareDef, MiddlewareRegistry } from './middlewares/Middleware.js'
import { HttpRequestMiddleware } from './middlewares/HttpRequestMiddleware.js'
import { JsonResponseMiddleware } from './middlewares/JsonResponseMiddleware.js'
import { TextResponseMiddleware } from './middlewares/TextResponseMiddleware.js'
import { EmptyMiddleware } from './middlewares/EmptyMiddleware.js'
import { ContextRegistry } from './contexts/Context.js'
import { HttpContext } from './contexts/HttpContext.js'

/**
 * Разделяемые зависимости.
 */
interface IEnvironment {
  readonly namedQueue: NamedAsyncQueue
  readonly middlewareRegistry: MiddlewareRegistry
  readonly contextRegistry: ContextRegistry
  readonly presetRegistry: PresetConfigRegistry
  readonly configRegistry: EndpointConfigRegistry
  /**
   * Значение по умолчанию для конфигураций конечных точек {@link EndpointConfig.kind}.
   * Если не определено будет использовано `'http'`.
   */
  readonly defaultConfigKind: string
  /**
   * Привязка по умолчанию для {@link EndpointConfig.kind} -> {@link Context.kind}.
   */
  readonly contextKindMap: ReadonlyMap<string, string>
  /**
   * Привязка по умолчанию для {@link EndpointConfig.kind} -> {@link Context.kind} -> {@link MiddlewareLike.kind}.
   */
  readonly executorKindMap: ReadonlyMap<string, string>
  readonly queryExtendsMode: TUrlQueryExtendsMode
  readonly queryAppendMode: TUrlQueryAppendMode
  readonly hashExtendsMode: TUrlHashExtendsMode
  readonly requestInitExtendsMode: TRequestInitExtendsMode
  readonly headersExtendsMode: THeadersExtendsMode
  readonly headersAppendMode: THeadersAppendMode
}

/**
 * Пользовательские определения и классы, которые будет автоматически зарегистрированы.
 *
 * По умолчанию {@link Environment} регистрирует несколько предустановленных классов {@link MiddlewareLike}, {@link ContextLike}
 * и {@link EndpointConfig}. Для отмены регистрации предопределенных классов полям можно установить `false` или передать
 * объекты с полями `false` которые следует проигнорировать.
 *
 * @example
 * ```ts
 * {
 *   middlewares: { TextResponseMiddleware: false }, // этот класс будет проигнорирован
 *   contexts: false, // по умолчанию не будет зарегистрирован ни один класс Context
 *   configs: { http: MyEndpointHttpConfig } // класс по умолчанию для kind:'http' будет проигнорирован и заменен на пользовательский
 * }
 * ```
 */
type TEnvironmentCustomOptions = {
  /**
   * Массив или объект с {@link MiddlewareLike}.
   */
  middlewares?: undefined | null | false | Record<string, false | TMiddlewareDef<any, any>> | TMiddlewareDef<any, any>[]
  /**
   * Массив или объект с конструкторами {@link Context}.
   */
  contexts?: undefined | null | false | { [K in string]: false | TContextConstructor<ContextLike> } | TContextConstructor<ContextLike>[]
  /**
   * Массив или объект с конструкторами {@link EndpointConfig}.
   */
  configs?: undefined | null | false | Record<string, false | TEndpointConfigConstructor<EndpointConfig>> | TEndpointConfigConstructor<EndpointConfig>[]
  /**
   * Объект с экземплярами {@link EndpointPresetConfig} или структурами пресетов конфигураций.
   */
  presets?: undefined | null | false | Record<string, false | TEndpointPresetConfig | EndpointPresetConfig>
}

/**
 * Опциональные параметры {@link Environment}.
 */
type TEnvironmentOptions = UOptional<Omit<IEnvironment, 'contextKindMap'>> & TEnvironmentCustomOptions & { contextKindMap?: undefined | null | Record<string, string> | IEnvironment['contextKindMap'] }

const defaultMiddlewares = Object.freeze([
  HttpRequestMiddleware,
  TextResponseMiddleware,
  JsonResponseMiddleware,
  EmptyMiddleware
] as const)
const defaultConfigs = Object.freeze([
  EndpointHttpConfig
] as const)
const defaultContexts = Object.freeze([
  HttpContext
] as const)
const defaultContextKindMap = Object.freeze({
  [EndpointHttpConfig.kind]: HttpContext.kind
} as const)
const defaultExecutorKindMap = Object.freeze({
  [EndpointHttpConfig.kind]: HttpRequestMiddleware.kind
} as const)
const defaultPresets: Record<string, EndpointPresetConfig> = Object.freeze({} as const)

function _ensureDefaultConfigKind (value: any): string {
  return isNonemptyString(value) ? value : EndpointHttpConfig.kind
}

function _ensureContextKindMap (value: any): Map<string, string> {
  if (!isObject(value)) {
    return new Map(Object.entries(defaultContextKindMap))
  }
  if (value instanceof Map) {
    return new Map(value)
  }
  return new Map(Object.entries(value))
}

function _ensureExecutorKindMap (value: any): Map<string, string> {
  if (!isObject(value)) {
    return new Map(Object.entries(defaultExecutorKindMap))
  }
  if (value instanceof Map) {
    return new Map(value)
  }
  return new Map(Object.entries(value))
}

function _normalizeMode<T extends number> (value: any, values: T[], defaultValue: T): T {
  return values.includes(value) ? value as T : defaultValue
}

function _registerMiddleware (middlewareRegistry: MiddlewareRegistry, middlewares: TEnvironmentCustomOptions['middlewares']) {
  const defMiddleware = new Map(defaultMiddlewares.map((v) => [v.kind, v]))
  const register = (item: TMiddlewareDef<any, any>) => {
    if (middlewareRegistry.has(item.kind)) {
      console.warn(`[ApiRouter.Environment] Middlewares ${safeToJson(item.kind)} уже зарегистрирован.`)
    }
    else {
      middlewareRegistry.register(item)
    }
  }
  if (middlewares) {
    if (Array.isArray(middlewares)) {
      for (const item of middlewares) {
        defMiddleware.delete(item.kind as any)
        register(item)
      }
    }
    else if (isPlainObject(middlewares)) {
      for (const [key, item] of Object.entries(middlewares)) {
        defMiddleware.delete(key as any)
        if (item) {
          register(item)
        }
      }
    }
  }
  else if (middlewares === false) {
    defMiddleware.clear()
  }
  for (const item of defMiddleware.values()) {
    register(item)
  }
}

function _registerContext (contextRegistry: ContextRegistry, contexts: TEnvironmentCustomOptions['contexts']) {
  const defCtx = new Map(defaultContexts.map((v) => [v.kind as string, v]))
  const register = (item: TContextConstructor<ContextLike>) => {
    if (contextRegistry.has(item.kind)) {
      console.warn(`[ApiRouter.Environment] Context ${safeToJson(item.kind)} уже зарегистрирован.`)
    }
    else {
      contextRegistry.register(item)
    }
  }
  if (contexts) {
    if (Array.isArray(contexts)) {
      for (const item of contexts) {
        defCtx.delete(item.kind)
        register(item)
      }
    }
    else if (isPlainObject(contexts)) {
      for (const [key, item] of Object.entries(contexts)) {
        defCtx.delete(key)
        if (item) {
          register(item)
        }
      }
    }
  }
  else if (contexts === false) {
    defCtx.clear()
  }
  for (const item of defCtx.values()) {
    register(item as TContextConstructor<any>)
  }
}

function _registerConfig (configRegistry: EndpointConfigRegistry, configs: TEnvironmentCustomOptions['configs']) {
  const defCfg = new Map<string, TEndpointConfigConstructor<EndpointConfig>>(defaultConfigs.map((v) => [v.kind, v as TEndpointConfigConstructor<EndpointConfig>]))
  const register = (item: TEndpointConfigConstructor<EndpointConfig>) => {
    if (configRegistry.has(item.kind)) {
      console.warn(`[ApiRouter.Environment] Конструктор EndpointConfig ${safeToJson(item.kind)} уже зарегистрирован.`)
    }
    else {
      configRegistry.register(item)
    }
  }
  if (configs) {
    if (Array.isArray(configs)) {
      for (const item of configs) {
        defCfg.delete(item.kind)
        register(item)
      }
    }
    else if (isPlainObject(configs)) {
      for (const [key, item] of Object.entries(configs)) {
        defCfg.delete(key)
        if (item) {
          register(item)
        }
      }
    }
  }
  else if (configs === false) {
    defCfg.clear()
  }
  for (const item of defCfg.values()) {
    register(item)
  }
}

function _registerPreset (presetRegistry: PresetConfigRegistry, presets: TEnvironmentCustomOptions['presets'], env: IEnvironment) {
  const defPreset = new Map(Object.entries(defaultPresets))
  const register = (key: string, item: EndpointPresetConfig) => {
    if (presetRegistry.has(key)) {
      console.warn(`[ApiRouter.Environment] EndpointPresetConfig ${safeToJson(key)} уже зарегистрирован.`)
    }
    else {
      presetRegistry.register(key, item)
    }
  }
  if (isPlainObject(presets)) {
    for (const [key, item] of Object.entries(presets)) {
      defPreset.delete(key)
      if (item) {
        const ins = (item instanceof EndpointPresetConfig)
          ? item
          : createEndpointPresetConfig(env, item)
        register(key, ins)
      }
    }
  }
  else if (presets === false) {
    defPreset.clear()
  }
  for (const [key, item] of defPreset) {
    register(key, item)
  }
}

/**
 * Реализация {@link IEnvironment} с дополнительными методами создания и расширения конфигураций конечных точек.
 */
class Environment implements IEnvironment {
  protected readonly _namedQueue: NamedAsyncQueue
  protected readonly _middlewareRegistry: MiddlewareRegistry
  protected readonly _contextRegistry: ContextRegistry
  protected readonly _presetRegistry: PresetConfigRegistry
  protected readonly _configRegistry: EndpointConfigRegistry
  protected readonly _contextKindMap: ReadonlyMap<string, string>
  protected readonly _executorKindMap: ReadonlyMap<string, string>
  protected readonly _defaultConfigKind: string
  protected readonly _queryExtendsMode: TUrlQueryExtendsMode
  protected readonly _queryAppendMode: TUrlQueryAppendMode
  protected readonly _hashExtendsMode: TUrlHashExtendsMode
  protected readonly _requestInitExtendsMode: TRequestInitExtendsMode
  protected readonly _headersExtendsMode: THeadersExtendsMode
  protected readonly _headersAppendMode: THeadersAppendMode

  constructor(options?: undefined | null | TEnvironmentOptions) {
    this._namedQueue = options?.namedQueue ?? new NamedAsyncQueue()
    this._middlewareRegistry = options?.middlewareRegistry ?? new MiddlewareRegistry()
    this._contextRegistry = options?.contextRegistry ?? new ContextRegistry()
    this._presetRegistry = options?.presetRegistry ?? new PresetConfigRegistry()
    this._configRegistry = options?.configRegistry ?? new EndpointConfigRegistry()
    this._contextKindMap = _ensureContextKindMap(options?.contextKindMap)
    this._executorKindMap = _ensureExecutorKindMap(options?.executorKindMap)
    this._defaultConfigKind = _ensureDefaultConfigKind(options?.defaultConfigKind)
    this._queryExtendsMode = _normalizeMode(options?.queryExtendsMode, [0, 1, 2], 0)
    this._queryAppendMode = _normalizeMode(options?.queryAppendMode, [0, 1], 0)
    this._hashExtendsMode = _normalizeMode(options?.hashExtendsMode, [0, 1], 0)
    this._requestInitExtendsMode = _normalizeMode(options?.requestInitExtendsMode, [0, 1], 0)
    this._headersExtendsMode = _normalizeMode(options?.headersExtendsMode, [0, 1, 2], 0)
    this._headersAppendMode = _normalizeMode(options?.headersAppendMode, [0, 1], 0)

    _registerMiddleware(this._middlewareRegistry, options?.middlewares)
    _registerContext(this._contextRegistry, options?.contexts)
    _registerConfig(this._configRegistry, options?.configs)
    _registerPreset(this._presetRegistry, options?.presets, this)
  }

  get namedQueue (): NamedAsyncQueue {
    return this._namedQueue
  }
  get middlewareRegistry (): MiddlewareRegistry {
    return this._middlewareRegistry
  }
  get contextRegistry (): ContextRegistry {
    return this._contextRegistry
  }
  get presetRegistry (): PresetConfigRegistry {
    return this._presetRegistry
  }
  get configRegistry (): EndpointConfigRegistry {
    return this._configRegistry
  }
  get contextKindMap (): ReadonlyMap<string, string> {
    return this._contextKindMap
  }
  get executorKindMap (): ReadonlyMap<string, string> {
    return this._executorKindMap
  }
  get defaultConfigKind (): string {
    return this._defaultConfigKind
  }
  get queryExtendsMode (): TUrlQueryExtendsMode {
    return this._queryExtendsMode
  }
  get queryAppendMode (): TUrlQueryAppendMode {
    return this._queryAppendMode
  }
  get hashExtendsMode (): TUrlHashExtendsMode {
    return this._hashExtendsMode
  }
  get requestInitExtendsMode (): TRequestInitExtendsMode {
    return this._requestInitExtendsMode
  }
  get headersExtendsMode (): THeadersExtendsMode {
    return this._headersExtendsMode
  }
  get headersAppendMode (): THeadersAppendMode {
    return this._headersAppendMode
  }

  /**
   * Нормализует параметры конфигурации и возвращает {@link EndpointOptionsConfig}.
   *
   * @param options Опциональные обобщенные параметры конфигурации конечной точки.
   */
  optionsConfig (options: TEndpointOptionsConfig): EndpointOptionsConfig {
    return createEndpointOptionsConfig(this, options)
  }

  /**
   * Нормализует параметры конфигурации и возвращает {@link EndpointPresetConfig}.
   *
   * @param options Опциональные обобщенные параметры конфигурации конечной точки.
   * @param name Если это непустая строка, конфигурация пресета будет автоматически зарегистрирована в {@link presetRegistry}.
   */
  presetConfig (options: TEndpointPresetConfig, name?: undefined | null | string): EndpointPresetConfig {
    const preset = createEndpointPresetConfig(this, options)
    if (isNonemptyString(name)) {
      this._presetRegistry.register(name, preset)
    }
    return preset
  }

  /**
   * Сливает обобщенные параметры конфигураций конечных точек в нормализованный {@link EndpointOptionsConfig}.
   *
   * @param configs Любое количество аргументов совместимых с {@link TEndpointOptionsConfig}.
   */
  extendsOptionsConfig (...configs: (TEndpointOptionsConfig | EndpointOptionsConfig | TEndpointPresetConfig | EndpointPresetConfig | TEndpointNormalizedOptionsConfig | TEndpointNormalizedPresetConfig)[]): EndpointOptionsConfig {
    return new EndpointOptionsConfig(extendsEndpointConfigs<true>(this, true, ...configs))
  }

  /**
   * Сливает обобщенные параметры конфигураций конечных точек в нормализованный {@link EndpointPresetConfig}.
   *
   * @param configs Любое количество аргументов совместимых с {@link TEndpointOptionsConfig}.
   */
  extendsPresetConfig (...configs: (TEndpointOptionsConfig | EndpointOptionsConfig | TEndpointPresetConfig | EndpointPresetConfig | TEndpointNormalizedOptionsConfig | TEndpointNormalizedPresetConfig)[]): EndpointPresetConfig {
    return new EndpointPresetConfig(extendsEndpointConfigs<false>(this, false, ...configs))
  }
}

export {
  type IEnvironment,
  type TEnvironmentCustomOptions,
  type TEnvironmentOptions,
  Environment
}
