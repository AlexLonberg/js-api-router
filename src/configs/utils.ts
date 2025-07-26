import {
  type TNumericBool,
  fnRetryDelayOrNull,
  isPositiveInteger,
  isPositiveNumber,
  isNumericBool,
  isNonNegInteger
} from '../types.js'
import { isSymbol, isNonemptyString, isObject, isArray, isFunction, safeToJson } from '../utils.js'
import { errorDetails, ConfigureError } from '../errors.js'
import {
  type TMiddlewareDef,
  type TMiddlewareInstanceRef,
  type TMiddlewareIterableRef,
  isMiddlewareRef
} from '../middlewares/Middleware.js'
import type { IEnvironment } from '../Environment.js'
import {
  type TEndpointNormalizedPresetConfig,
  type TEndpointPresetConfig,
  type TEndpointNormalizedOptionsConfig,
  type TEndpointOptionsConfig,
  defaultEndpointOptionsConfig,
  BASE_MIDDLEWARE,
  defaultEndpointPresetConfig,
  type TBaseMiddleware
} from './types.js'
import { type EndpointConfig, EndpointOptionsConfig, EndpointPresetConfig } from './EndpointConfig.js'
import { RequestInitConfig } from './RequestInitConfig.js'
import { HeadersConfig } from './HeadersConfig.js'
import { PathComponents } from './PathComponents.js'
import { type TUrlFragments, UrlConfig } from './UrlConfig.js'

type _TProcessor<T extends 'preprocessor' | 'postprocessor' | 'errorprocessor'> = {
  [K in T]?: TEndpointPresetConfig[T] | TMiddlewareIterableRef<any, any> | (string | TMiddlewareDef<any, any> | TBaseMiddleware | TMiddlewareIterableRef<any, any>)[]
}

function _extendsProcessor<T extends 'preprocessor' | 'postprocessor' | 'errorprocessor'> (
  propertry: T,
  env: IEnvironment,
  target: Pick<TEndpointNormalizedPresetConfig, T>,
  source: _TProcessor<T>
): void {
  const src = source[propertry]
  if (src) {
    // Конфигурация может иметь строку, допустимый тип, ленивую ссылку или массив
    // Все кроме массива будет обработано в реестре
    if (isMiddlewareRef(src)) {
      target[propertry] = src // Если здесь middleware.iterable - его нельзя передавать в middlewareRegistry.ref()
    }
    else if (isArray(src)) {
      let used = false
      const copy: TMiddlewareInstanceRef<any, any>[] = []
      for (const item of src) {
        if (item === BASE_MIDDLEWARE) {
          if (used) {
            throw new ConfigureError(errorDetails.ConfigureError("Константа 'BASE_MIDDLEWARE' в наборе Middleware может быть определена только один раз."))
          }
          used = true
          if (!isMiddlewareRef(target[propertry])) {
            console.error(`Базовая конфигурация '${propertry}' не имеет определения Middleware, вставка базовых обработчиков в массив будет проигнорирована.`)
          }
          else if (target[propertry].iterable) {
            // refs возвращает копию массива ленивых ссылок
            copy.push(...target[propertry].ref.refs)
          }
          else {
            copy.push(target[propertry])
          }
        }
        else {
          copy.push(item)
        }
      }
      target[propertry] = copy.length === 0 ? null : (copy.length === 1 ? env.middlewareRegistry.ref(copy[0]!) : env.middlewareRegistry.iter(copy))
    }
    else {
      target[propertry] = env.middlewareRegistry.ref(
        // @ts-expect-error TS не видит что здесь нет массива
        src
      )
    }
  }
  else if (src === false) {
    target[propertry] = null
  }
}

/**
 * Структура с методами для расширения конфигураций конечных точек.
 * Имена методов строго соответствуют именам полей обобщенной конфигурации {@link TEndpointNormalizedPresetConfig}.
 * Каждый из методов приинимает {@link IEnvironment}, целевую нормализованную структуру и пользовательские
 * необработанные параметры.
 *
 * Некоторые параметры могут переопределяться только парами, например `requestInit + headers`. Такие параметры следует
 * фильтровать и объединять при обходе структур, чтобы случайно не вызвать отсутствующий метод.
 */
const configExtender = Object.freeze({
  kind (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'kind'>, source: Pick<TEndpointPresetConfig, 'kind'>) {
    if (isNonemptyString(source.kind)) {
      target.kind = source.kind
    }
    else if (source.kind === false) {
      target.kind = null
    }
  },
  context (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'context'>, source: Pick<TEndpointPresetConfig, 'context'>) {
    if (source.context) {
      target.context = env.contextRegistry.factory(source.context)
    }
    else if (source.context === false) {
      target.context = null
    }
  },
  executor (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'executor'>, source: Pick<TEndpointPresetConfig, 'executor'>) {
    if (source.executor) {
      target.executor = env.middlewareRegistry.ref(source.executor as (string | TMiddlewareDef<any, any>))
    }
    else if (source.executor === false) {
      target.executor = null
    }
  },
  preprocessor (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'preprocessor'>, source: _TProcessor<'preprocessor'>) {
    _extendsProcessor('preprocessor', env, target, source)
  },
  postprocessor (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'postprocessor'>, source: _TProcessor<'postprocessor'>) {
    _extendsProcessor('postprocessor', env, target, source)
  },
  errorprocessor (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'errorprocessor'>, source: _TProcessor<'errorprocessor'>) {
    _extendsProcessor('errorprocessor', env, target, source)
  },
  queueKey (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'queueKey'>, source: Pick<TEndpointPresetConfig, 'queueKey'>) {
    if (isNonemptyString(source.queueKey)) {
      target.queueKey = source.queueKey
    }
    else if (source.queueKey === false) {
      target.queueKey = null
    }
  },
  queueLimit (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'queueLimit'>, source: Pick<TEndpointPresetConfig, 'queueLimit'>) {
    if (isPositiveInteger(source.queueLimit)) {
      target.queueLimit = source.queueLimit
    }
    else if (source.queueLimit === false) {
      target.queueLimit = null
    }
  },
  queuePriority (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'queuePriority'>, source: Pick<TEndpointPresetConfig, 'queuePriority'>) {
    if (isNonNegInteger(source.queuePriority)) {
      target.queuePriority = source.queuePriority
    }
    else if (source.queuePriority === false) {
      target.queuePriority = null
    }
  },
  queueUnordered (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'queueUnordered'>, source: { queueUnordered?: TEndpointPresetConfig['queueUnordered'] | TNumericBool }) {
    if (isNumericBool(source.queueUnordered)) {
      target.queueUnordered = source.queueUnordered
    }
    else if (source.queueUnordered === false) {
      target.queueUnordered = null
    }
  },
  timeout (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'timeout'>, source: Pick<TEndpointPresetConfig, 'timeout'>) {
    if (isPositiveNumber(source.timeout)) {
      target.timeout = source.timeout
    }
    else if (source.timeout === false) {
      target.timeout = null
    }
  },
  retries (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'retries'>, source: Pick<TEndpointPresetConfig, 'retries'>) {
    if (isPositiveInteger(source.retries)) {
      target.retries = source.retries
    }
    else if (source.retries === false) {
      target.retries = null
    }
  },
  retryDelay (_env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'retryDelay'>, source: Pick<TEndpointPresetConfig, 'retryDelay'>) {
    if (source.retryDelay === false) {
      target.retryDelay = null
      return
    }
    const fn = fnRetryDelayOrNull(source.retryDelay)
    if (fn) {
      target.retryDelay = fn
    }
  },
  requestInit (env: IEnvironment, target: Pick<TEndpointNormalizedPresetConfig, 'requestInit' | 'headers'>, source: Pick<TEndpointPresetConfig, 'requestInit' | 'headers'>) {
    // Эта функция так же обрабатывает заголовки
    let headers: HeadersInit | null | undefined = null
    if (source.requestInit) {
      if (source.requestInit instanceof RequestInitConfig) {
        target.requestInit = target.requestInit ? target.requestInit.extends(source.requestInit) : source.requestInit
      }
      else {
        // Переносим заголовки в другое свойство
        headers = source.requestInit.headers
        target.requestInit = target.requestInit ? target.requestInit.extends(source.requestInit) : new RequestInitConfig(source.requestInit, env.requestInitExtendsMode)
      }
    }
    else if (source.requestInit === false) {
      target.requestInit = null
    }
    if (source.headers === false) {
      target.headers = null
      return
    }
    // Сперва определяем из requestInit ...
    if (headers) {
      target.headers = target.headers
        ? target.headers.extends(headers)
        : (headers instanceof HeadersConfig)
          ? headers
          : new HeadersConfig(headers, env.headersExtendsMode, env.headersAppendMode)
    }
    // ... и теперь перезаписываем свойством с приоритетом
    if (source.headers) {
      target.headers = target.headers
        ? target.headers.extends(source.headers)
        : (source.headers instanceof HeadersConfig)
          ? source.headers
          : new HeadersConfig(source.headers, env.headersExtendsMode, env.headersAppendMode)
    }
  }
} as const)

const configExtenderExt = {
  path (env: IEnvironment, target: Pick<TEndpointNormalizedOptionsConfig, 'path'>, source: Pick<TEndpointOptionsConfig, 'path'>) {
    if (source.path) {
      if (source.path instanceof UrlConfig) {
        target.path = source.path
      }
      else if (target.path) {
        target.path = target.path.extends(source.path)
      }
      else if (source.path instanceof PathComponents) {
        throw new ConfigureError(errorDetails.ConfigureError('Целевой путь должен иметь базовый UrlConfig для расширения или параметры источника определять путь с абсолютным URL.'))
      }
      else {
        target.path = new UrlConfig(source.path as string | URL | (Omit<TUrlFragments, 'origin'> & { origin: string }), env)
      }
    }
  },
  target (_env: IEnvironment, target: Pick<TEndpointNormalizedOptionsConfig, 'target'>, source: Pick<TEndpointOptionsConfig, 'target'>) {
    if (isObject(source.target)) {
      target.target = source.target
    }
    else if (source.target === false) {
      target.target = null
    }
  },
  handler (_env: IEnvironment, target: Pick<TEndpointNormalizedOptionsConfig, 'handler'>, source: Pick<TEndpointOptionsConfig, 'handler'>) {
    if (isNonemptyString(source.handler) || isSymbol(source.handler) || isFunction(source.handler)) {
      target.handler = source.handler
    }
    else if (source.handler === false) {
      target.handler = null
    }
  },
  preset (env: IEnvironment, target: Pick<TEndpointNormalizedOptionsConfig, 'preset'>, source: Pick<TEndpointOptionsConfig, 'preset'>) {
    if (source.preset === false) {
      target.preset = null
    }
    else if (isNonemptyString(source.preset) || (source.preset instanceof EndpointPresetConfig)) {
      target.preset = source.preset
    }
    else if (isObject(source.preset)) {
      target.preset = createEndpointPresetConfig(env, source.preset)
    }
  }
}

function getDefaultOptions (): [TEndpointNormalizedOptionsConfig, Exclude<keyof TEndpointNormalizedPresetConfig, 'path' | 'headers' | 'target' | 'handler' | 'preset'>[]] {
  const cfg = defaultEndpointOptionsConfig()
  const keys = Object.keys(cfg).filter((k) => k !== 'headers' && k !== 'path' && k !== 'target' && k !== 'handler' && k !== 'preset')
  // @ts-expect-error
  return [cfg, keys]
}

function getDefaultPreset (): [TEndpointNormalizedPresetConfig, Exclude<keyof TEndpointNormalizedPresetConfig, 'headers'>[]] {
  const cfg = defaultEndpointPresetConfig()
  const keys = Object.keys(cfg).filter((k) => k !== 'headers')
  // @ts-expect-error
  return [cfg, keys]
}

/**
 * Нормализует параметры конфигурации и возвращает {@link EndpointOptionsConfig}.
 *
 * @param env Разделяемые параметры {@link IEnvironment}.
 * @param options Опциональные обобщенные параметры конфигурации конечной точки.
 */
function createEndpointOptionsConfig (env: IEnvironment, options: TEndpointOptionsConfig): EndpointOptionsConfig {
  const [cfg, keys] = getDefaultOptions()
  let nonusedRequestInit = true
  for (const key of keys) {
    configExtender[key](env, cfg, options)
    if (nonusedRequestInit && key === 'requestInit') {
      nonusedRequestInit = false
    }
  }
  if (nonusedRequestInit && ('headers' in options)) {
    configExtender.requestInit(env, cfg, options)
  }
  configExtenderExt.path(env, cfg, options)
  configExtenderExt.target(env, cfg, options)
  configExtenderExt.handler(env, cfg, options)
  configExtenderExt.preset(env, cfg, options)
  return new EndpointOptionsConfig(cfg)
}

/**
 * Нормализует параметры конфигурации и возвращает {@link EndpointPresetConfig}.
 *
 * @param env Разделяемые параметры {@link IEnvironment}.
 * @param options Опциональные обобщенные параметры конфигурации конечной точки.
 */
function createEndpointPresetConfig (env: IEnvironment, options: TEndpointPresetConfig): EndpointPresetConfig {
  const [cfg, keys] = getDefaultPreset()
  let nonusedRequestInit = true
  for (const key of keys) {
    configExtender[key](env, cfg, options)
    if (nonusedRequestInit && key === 'requestInit') {
      nonusedRequestInit = false
    }
  }
  if (nonusedRequestInit && ('headers' in options)) {
    configExtender.requestInit(env, cfg, options)
  }
  return new EndpointPresetConfig(cfg)
}

/**
 * Сливает обобщенные параметры конфигураций конечных точек в нормализованный {@link TEndpointNormalizedOptionsConfig}
 * или {@link TEndpointNormalizedPresetConfig}.
 *
 * @param env       Разделяемые параметры {@link IEnvironment}.
 * @param asOptions Если `true` возвращаемым объектом будет {@link TEndpointNormalizedOptionsConfig}, иначе {@link TEndpointNormalizedPresetConfig}.
 * @param configs   Любое количество аргументов совместимых с {@link TEndpointOptionsConfig}.
 */
function extendsEndpointConfigs<T extends boolean> (
  env: IEnvironment,
  asOptions: boolean,
  ...configs: (TEndpointOptionsConfig | EndpointOptionsConfig | TEndpointPresetConfig | EndpointPresetConfig | TEndpointNormalizedOptionsConfig | TEndpointNormalizedPresetConfig)[]
): T extends true ? TEndpointNormalizedOptionsConfig : TEndpointNormalizedPresetConfig {
  const [cfg, keys] = asOptions ? getDefaultOptions() : getDefaultPreset()
  let nonusedRequestInit = true
  for (const config of configs) {
    for (const key of keys) {
      configExtender[key](env, cfg, config)
      if (nonusedRequestInit && key === 'requestInit') {
        nonusedRequestInit = false
      }
    }
    if (nonusedRequestInit && ('headers' in config)) {
      configExtender.requestInit(env, cfg, config)
    }
    // Расширяется только для EndpointOptionsConfig
    if (asOptions) {
      // Из-за путаницы типов Options vs Preset, TS не видит этих свойств - заглушим как { ***: any }
      configExtenderExt.path(env, cfg as TEndpointNormalizedOptionsConfig, config as { path: any })
      configExtenderExt.target(env, cfg as TEndpointNormalizedOptionsConfig, config as { target: any })
      configExtenderExt.handler(env, cfg as TEndpointNormalizedOptionsConfig, config as { handler: any })
      configExtenderExt.preset(env, cfg as TEndpointNormalizedOptionsConfig, config as { preset: any })
    }
  }
  return cfg as (T extends true ? TEndpointNormalizedOptionsConfig : TEndpointNormalizedPresetConfig)
}

/**
 * Вспомогательная утилита сборки конфигурации конечной точки.
 *
 * @param env Разделяемое окружение {@link IEnvironment}.
 * @param key Ключ конечной точки.
 * @param config Пользовательская конфигурация.
 * @param baseConfig Базовая конфигурация. Обычно это должен быть локальный класс
 */
function buildEndpointConfig<T extends EndpointConfig> (
  env: IEnvironment,
  key: string | symbol,
  config: TEndpointOptionsConfig | EndpointOptionsConfig,
  baseConfig: EndpointOptionsConfig
): T {
  if (!isObject(config)) {
    throw new ConfigureError(errorDetails.ConfigureError(`Свойство конфигурации ${safeToJson(key)} должно быть объектом.`))
  }

  const strOrPreset = config.preset === false ? null : (config.preset ?? baseConfig.preset)
  const preset: EndpointPresetConfig | TEndpointPresetConfig | null =
    strOrPreset ? (
      isNonemptyString(strOrPreset)
        ? env.presetRegistry.getOrThrow(strOrPreset)
        : (isObject(strOrPreset) ? strOrPreset : null)
    ) : null

  // Сливаем параметры в обобщенный EndpointOptionsConfig
  // Встраиваем пресет и target посередине
  const target = config.target ?? baseConfig.target
  const derived = new EndpointOptionsConfig(extendsEndpointConfigs<true>(env, true, baseConfig, ...(preset ? [preset, { target }, config] : [{ target }, config])))

  // Если kind конечной точки не определен используем по умолчанию
  const kind = derived.kind ?? env.defaultConfigKind
  const cls = env.configRegistry.getOrThrow(kind)

  // Передаем ключ и нормализованные параметры в конструктор
  return new cls(env, derived, key) as T
}

export {
  createEndpointOptionsConfig,
  createEndpointPresetConfig,
  extendsEndpointConfigs,
  buildEndpointConfig
}
