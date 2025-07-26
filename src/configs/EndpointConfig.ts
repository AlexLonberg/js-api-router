import type {
  TNonemptyString,
  TPositiveNumber,
  TNonNegInteger,
  TPositiveInteger,
  TNumericBool,
  TFnRetryDelay
} from '../types.js'
import type { ContextFactoryLike } from '../interfaces/ContextLike.js'
import type { TMiddlewareInstanceRef, TMiddlewareRef } from '../middlewares/Middleware.js'
import type { IEnvironment } from '../Environment.js'
import type {
  TEndpointNormalizedBaseConfig,
  TEndpointNormalizedOptionsConfig,
  TEndpointNormalizedPresetConfig,
  TResponseHandler
} from './types.js'
import type { RequestInitConfig } from './RequestInitConfig.js'
import type { HeadersConfig } from './HeadersConfig.js'
import type { UrlConfig } from './UrlConfig.js'

/**
 * Базовая конфигурация конечной точки применимая ко всем подклассам.
 */
abstract class EndpointConfigBase {
  protected readonly _preprocessor: null | TMiddlewareRef<any, any>
  protected readonly _postprocessor: null | TMiddlewareRef<any, any>
  protected readonly _errorprocessor: null | TMiddlewareRef<any, any>
  protected readonly _queueKey: null | TNonemptyString
  protected readonly _queuePriority: null | TNonNegInteger
  protected readonly _queueLimit: null | TPositiveInteger
  protected readonly _queueUnordered: null | TNumericBool
  protected readonly _timeout: null | TPositiveNumber
  protected readonly _retries: null | TPositiveInteger
  protected readonly _retryDelay: null | TFnRetryDelay

  protected constructor(config: TEndpointNormalizedBaseConfig) {
    this._preprocessor = config.preprocessor
    this._postprocessor = config.postprocessor
    this._errorprocessor = config.errorprocessor
    this._queuePriority = config.queuePriority
    this._queueLimit = config.queueLimit
    this._queueKey = config.queueKey
    this._queueUnordered = config.queueUnordered
    this._timeout = config.timeout
    this._retries = config.retries
    this._retryDelay = config.retryDelay
  }

  get preprocessor (): null | TMiddlewareRef<any, any> {
    return this._preprocessor
  }

  get postprocessor (): null | TMiddlewareRef<any, any> {
    return this._postprocessor
  }

  get errorprocessor (): null | TMiddlewareRef<any, any> {
    return this._errorprocessor
  }

  get queueKey (): null | TNonemptyString {
    return this._queueKey
  }

  get queuePriority (): null | TNonNegInteger {
    return this._queuePriority
  }

  get queueLimit (): null | TPositiveInteger {
    return this._queueLimit
  }

  get queueUnordered (): null | TNumericBool {
    return this._queueUnordered
  }

  get timeout (): null | TPositiveNumber {
    return this._timeout
  }

  get retries (): null | TPositiveInteger {
    return this._retries
  }

  get retryDelay (): null | TFnRetryDelay {
    return this._retryDelay
  }
}

/**
 * Конфигурация пресета.
 */
class EndpointPresetConfig extends EndpointConfigBase {
  protected readonly _kind: null | TNonemptyString
  protected readonly _context: null | ContextFactoryLike
  protected readonly _executor: null | TMiddlewareInstanceRef<any, any>
  protected readonly _requestInit: null | RequestInitConfig
  protected readonly _headers: null | HeadersConfig

  constructor(config: TEndpointNormalizedPresetConfig) {
    super(config)
    this._kind = config.kind
    this._context = config.context
    this._executor = config.executor
    this._requestInit = config.requestInit
    this._headers = config.headers
  }

  get kind (): null | TNonemptyString {
    return this._kind
  }

  get context (): null | ContextFactoryLike {
    return this._context
  }

  get executor (): null | TMiddlewareInstanceRef<any, any> {
    return this._executor
  }

  get requestInit (): null | RequestInitConfig {
    return this._requestInit
  }

  get headers (): null | HeadersConfig {
    return this._headers
  }
}

/**
 * Полный обобщенный набор параметров конфигурации любой конечной точки.
 *
 * **Note:** Набор параметров может не иметь обязательных свойств для конечной точки {@link EndpointConfig}.
 * Конфигурация передается в конструкторы конечной точки {@link TEndpointConfigConstructor} вместе с {@link IEnvironment}.
 */
class EndpointOptionsConfig extends EndpointPresetConfig {
  protected readonly _path: null | UrlConfig
  protected readonly _target: null | object
  protected readonly _handler: null | symbol | TNonemptyString | TResponseHandler<any>
  protected readonly _preset: null | TNonemptyString | EndpointPresetConfig

  constructor(config: TEndpointNormalizedOptionsConfig) {
    super(config)
    this._path = config.path
    this._target = config.target
    this._handler = config.handler
    this._preset = config.preset
  }

  get path (): null | UrlConfig {
    return this._path
  }

  get target (): null | object {
    return this._target
  }

  get handler (): null | symbol | TNonemptyString | TResponseHandler<any> {
    return this._handler
  }

  /**
   * Ссылка на инстанс пресета или зарегистрированное имя пресета.
   */
  get preset (): null | TNonemptyString | EndpointPresetConfig {
    return this._preset
  }
}

/**
 * Специализированная конфигурация конечной точки.
 */
abstract class EndpointConfig extends EndpointConfigBase {
  /**
   * Уникальный глобальный зарегистрированный тип конечной точки.
   *
   * Используется как ключ выбора класса конфигурации в конструктор которого передаются нормализованные
   * пользовательские параметры.
   */
  abstract readonly kind: string
  abstract readonly key: symbol | string
  abstract readonly context: ContextFactoryLike
  abstract readonly handler: null | TResponseHandler<any>
}

/**
 * Конструктор специализированной конечной точки {@link EndpointConfig}.
 *
 * @type T Используйте дженерик для приведения к более конкретному типу.
 */
interface TEndpointConfigConstructor<T extends EndpointConfig> {
  /**
   * Уникальный глобальный зарегистрированный тип конечной точки.
   *
   * Используется для регистрации класса и динамического выбора конструктора конфигурации конечной точки.
   */
  readonly kind: string
  /**
   * @param env    Общие зависимости.
   * @param config Нормализованная обобщенная конфигурация.
   * @param key    Чаще всего это поле класса на котором была определена конфигурация. Этот параметр используется только
   *               для диагностики и ни на что не влияет. Если экземпляр класса создается вне классов-определений, этот
   *               параметр может быть любым.
   */
  new(env: IEnvironment, config: EndpointOptionsConfig, key: symbol | string): T
}

export {
  EndpointConfigBase,
  EndpointPresetConfig,
  EndpointOptionsConfig,
  EndpointConfig,
  type TEndpointConfigConstructor
}
