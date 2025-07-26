import { interfaceMarker } from 'ts-interface-core'
import { isFunction, isNonemptyString, safeToJson } from '../utils.js'
import { ConfigureError, errorDetails } from '../errors.js'
import type { MiddlewareLike } from '../interfaces/MiddlewareLike.js'
import { type TContextConstructor, ContextLike, ContextFactoryLike } from '../interfaces/ContextLike.js'
import { RegistryBase } from '../libs/RegistryBase.js'
import type { THttpRequestMethod } from '../configs/types.js'
import type { MutableUrl, TUrlComponents } from '../configs/UrlConfig.js'
import type { MutableRequestInit } from '../configs/RequestInitConfig.js'
import type { MutableHeaders } from '../configs/HeadersConfig.js'
import type { EndpointConfig } from '../configs/EndpointConfig.js'
import type { EndpointHttpConfig } from '../configs/EndpointHttpConfig.js'

const _CONSTRUCT = Symbol()

function _createFactory (kind: string, construct: TContextConstructor): ContextFactoryLike<any> {
  return Object.defineProperties({} as ContextFactoryLike, {
    [interfaceMarker(ContextFactoryLike)!]: {
      value: null
    },
    kind: {
      enumerable: true,
      value: kind
    },
    [_CONSTRUCT]: { value: construct },
    create: {
      enumerable: true,
      value: function (endpoint: EndpointConfig, options: Record<string, any>) {
        // Reflect.construct(this._construct, [endpoint, options])
        return new this[_CONSTRUCT](endpoint, options)
      }
    }
  })
}

/**
 * Реестр {@link ContextLike}
 */
class ContextRegistry extends RegistryBase<string, ContextFactoryLike> {
  protected readonly _lazyFactories = new Map<string, ContextFactoryLike<any>>()

  register (ctx: TContextConstructor | ContextFactoryLike): void {
    if (this._frozen) {
      throw new ConfigureError(errorDetails.ConfigureError(`ContextRegistry заморожен и не может зарегистрировать новый тип Context ${safeToJson(ctx.kind)}.`))
    }
    if (!isNonemptyString(ctx.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Именем Context должна быть непустая строка, получено: ${safeToJson(ctx.kind)}.`))
    }
    if (this._items.has(ctx.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Context "${ctx.kind}" уже зарегистрирован.`))
    }
    if (ctx instanceof ContextFactoryLike) {
      this._items.set(ctx.kind, ctx)
    }
    else if (isFunction<TContextConstructor>(ctx)) {
      this._items.set(ctx.kind, _createFactory(ctx.kind, ctx))
    }
    else {
      throw new ConfigureError(errorDetails.ConfigureError(`Аргументом 'ctx' должен быть допустимый 'TContextConstructor|ContextFactoryLike', получено: ${safeToJson(ctx)}`))
    }
  }

  protected _createLazyFactory (key: string): ContextFactoryLike<any> {
    const items = this._items
    let wrapper = items.get(key)
    if (wrapper) {
      return wrapper
    }
    const factories = this._lazyFactories
    wrapper = factories.get(key)
    if (wrapper) {
      return wrapper
    }
    wrapper = Object.defineProperties({} as ContextFactoryLike, {
      [interfaceMarker(ContextFactoryLike)!]: {
        value: null
      },
      kind: {
        enumerable: true,
        value: key
      },
      create: {
        configurable: true,
        enumerable: true,
        value: function (endpoint: EndpointConfig, options: Record<string, any>) {
          const factory = items.get(key)
          if (!factory) {
            throw new ConfigureError(errorDetails.ConfigureError(`Context ${safeToJson(key)} не зарегистрирован.`))
          }
          if (_CONSTRUCT in factory) {
            Object.defineProperties(wrapper, {
              [_CONSTRUCT]: {
                value: factory[_CONSTRUCT]
              },
              create: {
                configurable: false,
                enumerable: true,
                value: function (endpoint: EndpointConfig, options: Record<string, any>) {
                  return new this[_CONSTRUCT](endpoint, options)
                }
              }
            })
          }
          else {
            Object.defineProperties(wrapper, {
              _factory: {
                value: factory
              },
              create: {
                configurable: false,
                enumerable: true,
                value: function (endpoint: EndpointConfig, options: Record<string, any>) {
                  return this._factory(endpoint, options)
                }
              }
            })
          }
          factories.delete(key)
          return factory.create(endpoint, options)
        }
      }
    })
    factories.set(key, wrapper)
    return wrapper
  }

  factory<T extends ContextLike> (ctx: string | TContextConstructor<T> | ContextFactoryLike<T>): ContextFactoryLike<T> {
    if (ctx instanceof ContextFactoryLike) {
      return ctx
    }
    if (isNonemptyString(ctx)) {
      return this._items.get(ctx) ?? this._createLazyFactory(ctx)
    }
    if (isFunction<TContextConstructor>(ctx)) {
      return _createFactory(ctx.kind, ctx)
    }
    throw new ConfigureError(errorDetails.ConfigureError(`Аргументом 'ctx' должен быть допустимый 'string|TContextConstructor|ContextFactoryLike', получено: ${safeToJson(ctx)}`))
  }
}

abstract class HttpContextLike<TOut> extends ContextLike<EndpointHttpConfig<TOut>, TOut> {
  /**
   * Допустимый метод запроса. Для `http` запросов это `GET/POST`.
   */
  abstract readonly method: THttpRequestMethod
  /**
   * Изменяемый `URL`.
   */
  abstract readonly url: MutableUrl
  /**
   * Изменяемые параметры запроса.
   */
  abstract readonly requestInit: MutableRequestInit
  /**
   * Изменяемые заголовки.
   */
  abstract readonly headers: MutableHeaders
  /**
   * Пользовательский `id` запроса, если последний был передан в соответствующие функции запроса.
   */
  abstract readonly requestId: null | number | symbol | string
  /**
   * Пользовательский объект опций, если последний был передан в соответствующие функции запроса.
   */
  abstract readonly options: null | Record<string, any>
}

/**
 * Параметры контекста {@link HttpContextLike}.
 */
interface THttpContextOptions {
  /**
   * Метод запроса.
   */
  method: THttpRequestMethod
  /**
   * Динамический путь, который может расширять константный путь маршрута.
   */
  path?: undefined | null | string | TUrlComponents
  /**
   * Данные запроса `POST`.
   */
  data?: undefined | null | any
  /**
   * Необязательный идентификатор запроса. Актуален для функций обратного вызова.
   */
  requestId?: undefined | null | symbol | number | string
  /**
   * Пользовательский {@link AbortSignal}.
   */
  abortSignal?: undefined | null | AbortSignal
  /**
   * Объект опций устанавливаемый контексту. Может быть использован {@link MiddlewareLike}.
   */
  options?: undefined | null | Record<string, any>
}

export {
  ContextRegistry,
  HttpContextLike,
  type THttpContextOptions
}
