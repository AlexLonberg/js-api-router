import { type AsyncQueue } from '../libs/AsyncQueue.js'
import { ConfigureError, errorDetails } from '../errors.js'
import type { ContextFactoryLike } from '../interfaces/ContextLike.js'
import type { TMiddlewareInstanceRef } from '../middlewares/Middleware.js'
import type { HttpContextLike } from '../contexts/Context.js'
import type { IEnvironment } from '../Environment.js'
import { type EndpointOptionsConfig, EndpointConfig } from './EndpointConfig.js'
import { isFunction, isNonemptyString, isSymbol, safeToJson } from '../utils.js'
import { UrlConfig } from './UrlConfig.js'
import { RequestInitConfig } from './RequestInitConfig.js'
import { HeadersConfig } from './HeadersConfig.js'
import {
  type TEndpointBaseConfig,
  type TEndpointPartPathConfig,
  type TEndpointPartPresetConfig,
  type TEndpointPartRequestInitConfig,
  type TEndpointPartHandlerConfig,
  type TResponseHandler
} from './types.js'

/**
 * Конфигурация конечной точки Http.
 */
interface TEndpointHttpConfig extends
  TEndpointBaseConfig,
  TEndpointPartPathConfig,
  TEndpointPartRequestInitConfig,
  TEndpointPartHandlerConfig<any>,
  TEndpointPartPresetConfig {
  // ...
}

type TEndpointHttpConfigRequiredProps = {
  url: UrlConfig
  context: ContextFactoryLike<HttpContextLike<any>, EndpointHttpConfig<any>>
  executor: TMiddlewareInstanceRef<any, any>
  queue: null | AsyncQueue
  requestInit: RequestInitConfig
  headers: HeadersConfig
  handler: null | TResponseHandler<any>
}

function ensureEndpointHttpConfigRequiredProps (env: IEnvironment, config: EndpointOptionsConfig, key: symbol | string, kind: string): TEndpointHttpConfigRequiredProps {
  const resolved = {} as TEndpointHttpConfigRequiredProps
  if (!(config.path instanceof UrlConfig)) {
    throw new ConfigureError(errorDetails.ConfigureError(`Конфигурация 'EndpointHttpConfig:http, key:${safeToJson(key)}' предполагает обязательный базовый абсолютный 'UrlConfig'.`))
  }
  resolved.url = config.path
  if (config.context) {
    resolved.context = config.context as ContextFactoryLike<HttpContextLike<any>, EndpointHttpConfig<any>>
  }
  else {
    const ctxKind = env.contextKindMap.get(kind)
    let ctxCls: ContextFactoryLike
    if (!ctxKind || !(ctxCls = env.contextRegistry.factory(ctxKind))) {
      throw new ConfigureError(errorDetails.ConfigureError(`Конфигурация 'EndpointHttpConfig:http, key:${safeToJson(key)}' не связана ни с одним контекстом выполнения 'Context'.`))
    }
    resolved.context = ctxCls as ContextFactoryLike<HttpContextLike<any>, EndpointHttpConfig<any>>
  }
  if (config.executor) {
    resolved.executor = config.executor
  }
  else {
    const exKind = env.executorKindMap.get(kind)
    let exRef: TMiddlewareInstanceRef<any, any>
    if (!exKind || !(exRef = env.middlewareRegistry.ref(exKind))) {
      throw new ConfigureError(errorDetails.ConfigureError(`Конфигурация 'EndpointHttpConfig:http, key:${safeToJson(key)}' не связана ни с одним основным исполнителем запроса 'Middleware'.`))
    }
    resolved.executor = exRef
  }
  if (config.queueKey) {
    resolved.queue = env.namedQueue.getOrCreateQueue(config.queueKey, config.queueLimit)
  }
  else {
    resolved.queue = null
  }
  resolved.requestInit = config.requestInit ?? new RequestInitConfig(null, env.requestInitExtendsMode)
  resolved.headers = config.headers ?? new HeadersConfig(null, env.headersExtendsMode, env.headersAppendMode)

  if (isFunction(config.handler)) {
    resolved.handler = config.handler
  }
  else if ((isNonemptyString(config.handler) || isSymbol(config.handler)) && config.target && (config.handler in config.target)) {
    resolved.handler = (config.target as any)[config.handler].bind(config.target)
  }
  else {
    resolved.handler = null
  }

  return resolved
}

class EndpointHttpConfig<TOut> extends EndpointConfig {
  static get kind (): 'http' { return 'http' }
  get kind (): 'http' { return 'http' }

  protected readonly _key: symbol | string
  protected readonly _url: UrlConfig
  protected readonly _context: ContextFactoryLike<HttpContextLike<any>, EndpointHttpConfig<any>>
  protected readonly _executor: TMiddlewareInstanceRef<any, any>
  protected readonly _queue: null | AsyncQueue
  protected readonly _requestInit: RequestInitConfig
  protected readonly _headers: HeadersConfig
  protected readonly _handler: null | TResponseHandler<TOut>

  constructor(env: IEnvironment, config: EndpointOptionsConfig, key: symbol | string) {
    super(config)
    this._key = key
    const resolved = ensureEndpointHttpConfigRequiredProps(env, config, key, this.kind)
    this._url = resolved.url
    this._context = resolved.context
    this._executor = resolved.executor
    this._queue = resolved.queue
    this._requestInit = resolved.requestInit
    this._headers = resolved.headers
    this._handler = resolved.handler
  }

  get key (): symbol | string {
    return this._key
  }

  get context (): ContextFactoryLike<HttpContextLike<any>, EndpointHttpConfig<any>> {
    return this._context
  }

  get queue (): null | AsyncQueue {
    return this._queue
  }

  get executor (): TMiddlewareInstanceRef<any, any> {
    return this._executor
  }

  get url (): UrlConfig {
    return this._url
  }

  get requestInit (): RequestInitConfig {
    return this._requestInit
  }

  get headers (): HeadersConfig {
    return this._headers
  }

  get handler (): null | TResponseHandler<TOut> {
    return this._handler
  }
}

export {
  type TEndpointHttpConfig,
  EndpointHttpConfig
}
