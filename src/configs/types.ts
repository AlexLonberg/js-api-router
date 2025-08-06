import type {
  UOptional,
  TPositiveNumber,
  TNonNegInteger,
  TPositiveInteger,
  TNonemptyString,
  TNumericBool,
  TFnRetryDelay,
} from '../types.js'
import type {
  ApiRouterError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TimeoutError
} from '../errors.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { MiddlewareLike } from '../interfaces/MiddlewareLike.js'
import type { ContextFactoryLike, TContextConstructor } from '../interfaces/ContextLike.js'
import type { TMiddlewareDef, TMiddlewareInstanceRef, TMiddlewareRef } from '../middlewares/Middleware.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NamedAsyncQueue } from '../libs/AsyncQueue.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { IEnvironment } from '../Environment.js'
import type { HeadersConfig } from './HeadersConfig.js'
import type { RequestInitConfig, TRequestInitOptions } from './RequestInitConfig.js'
import type { EndpointPresetConfig } from './EndpointConfig.js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { EndpointConfigRegistry } from './registries.js'
import type { PathComponents } from './PathComponents.js'
import type { TUrlFragments, UrlConfig } from './UrlConfig.js'

/**
 * Метод запроса.
 * DOC https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
 */
type THttpRequestMethod = 'GET' | 'POST'

// NOTE Не знаю что это https://developer.mozilla.org/en-US/docs/Web/API/Request/destination
// destination?: Nullish | RequestDestination
/**
 * Базовые имена свойств {@link RequestInit}.
 */
const requestBaseConfigProps = Object.freeze([
  'cache', // RequestCache
  'credentials', // RequestCredentials
  'integrity', // string
  'keepalive', // boolean
  'mode', // RequestMode
  'priority', // RequestPriority
  'redirect', // RequestRedirect
  'referrer', // string
  'referrerPolicy' // ReferrerPolicy
  // Эти параметры изменяются и не включены в список
  //  method: THttpRequestMethod
  //  headers: HeadersInit
  //  body: BodyInit | null
  //  signal: AbortSignal | null
] as const)

/**
 * Базовые имена свойств {@link RequestInit}.
 */
type TRequestBaseCongigKey = (typeof requestBaseConfigProps)[number]

/**
 * Базовые параметры запроса. Эти параметры могут быть зафиксированы в момент инициализации. Методы запроса
 * `RequestInit.method` не используются и определяются функциями `get/post` или соответствующими маршрутами.
 */
type TRequestBaseInit = Pick<RequestInit, TRequestBaseCongigKey | 'headers'>

/**
 * Параметры запроса без тела {@link RequestInit.body}. То же что и {@link TRequestBaseInit}, но добавляет `signal`.
 */
type TRequestInit = TRequestBaseInit & Pick<RequestInit, 'signal'>

/**
 * Предварительные параметры запроса. Этот объект имеет те же параметры, что и оригинальный
 * [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit),
 * исключая тело запроса `body` и `signal`.
 */
type TRequestBaseOptions = UOptional<TRequestBaseInit>

/**
 * Параметры запроса исключая `body`, который передается параметру функции.
 */
type TRequestOptions = UOptional<TRequestInit>

/**
 * Константа, которая может быть использована для слияния базовых `middleware` с параметрами
 * {@link TEndpointBaseConfig.preprocessor} и/или {@link TEndpointBaseConfig.postprocessor}.
 */
const BASE_MIDDLEWARE = Symbol('BASE_MIDDLEWARE')
/**
 * Константа, которая может быть использована для слияния базовых `middleware` с параметрами
 * {@link TEndpointBaseConfig.preprocessor} и/или {@link TEndpointBaseConfig.postprocessor}.
 */
type TBaseMiddleware = typeof BASE_MIDDLEWARE

/**
 * Пользовательский обработчик запроса.
 */
interface TResponseHandler<T> {
  /**
   * @param ok Гарантирует результат в параметре `value` или `error`(если `ok:false`).
   * @param value Результат запроса.
   * @param error Ошибка {@link ApiRouterError}.
   * @param requestId Пользовательский `id`, если был передан в соответствующие методы запроса.
   */
  (ok: true, value: T, error?: undefined | null, requestId?: undefined | null | symbol | number | string): any
  (ok: false, value: null | T, error: ApiRouterError, requestId?: undefined | null | symbol | number | string): any
  (ok: boolean, value: null | T, error?: undefined | null | ApiRouterError, requestId?: undefined | null | symbol | number | string): any
}

/**
 * Базовая конфигурация конечной точки.
 *
 * Параметры конфигурации наследуются и/или переопределяют базовые параметры. Если необходимо избежать наследования,
 * полю можно установить `false`. Здесь `false` не является значением, а служит флагом - игнорировать наследование.
 * Булевые значения в опциональных параметрах намеренно указаны как `0|1`.
 *
 * @example
 * ```ts
 * // Создаем базовый конфиг
 * const baseConfig = environment.optionsConfig({retries: 2})
 * const config = environment.extendsOptionsConfig(baseConfig, {retries: false})
 * // config.retries === null
 * ```
 */
interface TEndpointBaseConfig {
  /**
   * Тип конечной точки на основе которого будет выбран класс конфигурации зарегистрированный в {@link EndpointConfigRegistry}.
   *
   * По умолчанию `'http'` или явно определенный в {@link IEnvironment.defaultConfigKind}.
   */
  kind?: undefined | null | false | string
  /**
   * Связь с конекстом выполнения. По умолчанию будет связано через {@link IEnvironment.contextKindMap}.
   *
   * Контексты определенные строкой должны быть зарегистрированы в {@link IEnvironment.contextRegistry}.
   *
   * Любой {@link kind} может быть связан с разными контекстами.
   */
  context?: undefined | null | false | string | TContextConstructor | ContextFactoryLike
  /**
   * Имя основного исполнителя запроса или {@link MiddlewareLike}. По умолчанию `'http'`.
   *
   * **Warning:** По умолчанию считается что глобально зарегистрирован {@link MiddlewareLike} с именем `'http'` для
   * типичных вариантов использования.
   *
   * Исполнитель вызывается после предварительной обработки цепочки {@link preprocessor}.
   */
  executor?: undefined | null | false | string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any>
  /**
   * Пред-обработчики запроса в любом допустимом формате.
   *
   * Константа {@link TBaseMiddleware} может быть использована в массиве только и в одном месте.
   */
  preprocessor?: undefined | null | false | string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | (string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | TBaseMiddleware)[]
  /**
   * Обработчики ответа в любом допустимом формате.
   *
   * Константа {@link TBaseMiddleware} может быть использована в массиве и только в одном месте.
   */
  postprocessor?: undefined | null | false | string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | (string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | TBaseMiddleware)[]
  /**
   * Обработчики ошибки {@link MiddlewareLike} в любом допустимом формате.
   *
   * Константа {@link TBaseMiddleware} может быть использована в массиве и только в одном месте.
   */
  errorprocessor?: undefined | null | false | string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | (string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any> | TBaseMiddleware)[]
  /**
   * Ключ очереди {@link NamedAsyncQueue} в которой выполняется запрос. Запрос не будет отправлен пока очередь занята.
   *
   * Если этот параметр не определен, очередь не используется.
   */
  queueKey?: undefined | null | false | string
  /**
   * Максимальное количество одновременно выполняемых задач в очереди.
   *
   * + Каждая очередь создается с заданным `queueKey` и ограничением `queueLimit`.
   * + Очереди могут быть общими для разных эндпоинтов.
   * + Если несколько конфигураций указывают разные `queueLimit` для одной и той же очереди, будет использоваться наибольшее из них.
   */
  queueLimit?: undefined | null | false | number
  /**
   * Приоритет в очереди. Имеет смысл если задано {@link queueKey}, иначе игнорируется.
   */
  queuePriority?: undefined | null | false | number
  /**
   * По умолчанию, если задана очередь {@link queueKey}, запросы обслуживаются в порядке поступления и повторные попытки
   * {@link retries} могут сдерживать поток выполнения. Этот параметр переопределяет поведение по умолчанию и
   * освобождает очередь от незавершенного запроса, после чего снова добавляет его в очередь.
   */
  queueUnordered?: undefined | null | false | 0 | 1
  /**
   * Максимальное время жизни запроса в `ms`, включая время ожидания в очереди. По умолчанию не используется.
   *
   * По истечению времени запрос прерывается с ошибкой {@link TimeoutError}.
   *
   * **Важно:** Не влияет на выполнение обработчиков `postprocessor:Midleware`, если ответ уже получен.
   */
  timeout?: undefined | null | false | number
  /**
   * Количество повторных попыток в случае ошибки. По умолчанию не используется.
   */
  retries?: undefined | null | false | number
  /**
   * Задержка между попытками запросов в случае ошибки. Может быть числом (`ms`) или функцией `(attempt) => delay`.
   *
   * @example
   * ```ts
   * retryDelay: (attempt) => Math.min(1000 * 2 ** (attempt - 1), 30000)
   * ```
   */
  retryDelay?: undefined | null | false | number | ((attempt: number) => number)
}

interface TEndpointPartPathConfig {
  /**
   * Абсолютный или относительный путь который будет использован для маршрута.
   *
   * **Warning:** Пути не могут использовать флаг `false` и всегда наследуются, расширяются или переопределяются.
   *
   * **Note:** Как расширяется маршрут:
   *
   *  + Если аргумент окажется пустым, маршрут не расширяется и возвращается ссылка на доступный базовый `UrlConfig`.
   *  + Если строка или {@link TUrlFragments} приводятся к абсолютному `URL`, создается новый `UrlConfig` и никакие
   *    параметры не наследуются. Так же это относится к аргументу типа {@link UrlConfig}.
   *  + Строка приводится к {@link PathComponents} и расширяет текущий маршрут.
   *  + Компоненты {@link TUrlFragments} расширяют свои своиства.
   */
  path?: undefined | null | string | PathComponents | TUrlFragments | UrlConfig
}

/**
 * Конфигурация конечной точки Http.
 */
interface TEndpointPartRequestInitConfig {
  /**
   * Предварительные параметры запроса. Этот объект имеет те же параметры, что и оригинальный
   * [RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit),
   * исключая методы `GET/POST`, тело запроса `body` и `signal`.
   */
  requestInit?: undefined | null | false | TRequestInitOptions | RequestInitConfig
  /**
   * Заголовки запроса.
   * Заголовки этого свойства имеют приоритет над {@link requestInit} и будут расширять конфигурацию в последнюю очередь.
   */
  headers?: undefined | null | false | HeadersInit | HeadersConfig
}

/**
 * Расширение конфигурации запроса для конечных точек использующих функции обработчики.
 */
interface TEndpointPartHandlerConfig<TOut> {
  /**
   * Целевой объект в контексте которого будет вызвана {@link handler} если последний определен как `symbol` или `string`.
   * По умолчанию целевым объектом является класс на котором определены свойства конфигурации.
   */
  target?: undefined | null | false | object
  /**
   * Обработчик запроса. Может быть `symbol|string` или функцией.
   *
   * **Note:** Функция вызывается без привязки к контексту. `symbol` или `string` привязываются к свойству `target`.
   *
   * **Warning:** Не устанавливайте обработчик, если запросы ожидают результат в вызываемой функции. Контекс запроса
   * отправляет ответ только в обработчик или `return`, но не в два канала получения ответа.
   */
  handler?: undefined | null | false | symbol | string | TResponseHandler<TOut>
}

interface TEndpointPartPresetConfig {
  /**
   * Зарегистрированный набор предустановок.
   *
   * Наборы предустановок применяются первыми и расширяются более конкретными параметрами.
   */
  preset?: undefined | null | false | string | TEndpointPresetConfig | EndpointPresetConfig
}

/**
 * Обобщенные параметры конфигурации для любой конечной точки.
 *
 * Такие параметры могут иметь неиспользуемые поля в специализированных конфигурациях, но служат носителем для
 * расширений конфигураций маршрутов.
 */
interface TEndpointOptionsConfig extends
  TEndpointBaseConfig,
  TEndpointPartPathConfig,
  TEndpointPartRequestInitConfig,
  TEndpointPartHandlerConfig<any>,
  TEndpointPartPresetConfig {
  // ...
}

/**
 * Обобщенные параметры конфигурации для пресетов.
 *
 * Классы {@link EndpointPresetConfig} не могут иметь вложенных пресетов и полей которые должны быть уникальными для
 * специализированных конечных точек.
 *
 * Пресеты могут использоваться для определения схожих конфигураций.
 */
interface TEndpointPresetConfig extends
  TEndpointBaseConfig,
  TEndpointPartRequestInitConfig {
  // ...
}

/**
 * Нормализованная конфигурация базовых параметров.
 */
interface TEndpointNormalizedBaseConfig {
  kind: null | TNonemptyString
  preprocessor: null | TMiddlewareRef<any, any>
  postprocessor: null | TMiddlewareRef<any, any>
  errorprocessor: null | TMiddlewareRef<any, any>
  queueKey: null | TNonemptyString
  queueLimit: null | TPositiveInteger
  queuePriority: null | TNonNegInteger
  queueUnordered: null | TNumericBool
  timeout: null | TPositiveNumber
  retries: null | TPositiveInteger
  retryDelay: null | TFnRetryDelay
  requestInit: null | RequestInitConfig
  headers: null | HeadersConfig
}

/**
 * Нормализованная конфигурация пресетов.
 */
interface TEndpointNormalizedPresetConfig extends TEndpointNormalizedBaseConfig {
  context: null | ContextFactoryLike
  executor: null | TMiddlewareInstanceRef<any, any>
}

/**
 * Нормализованная конфигурация обобщенных параметров.
 */
interface TEndpointNormalizedOptionsConfig extends TEndpointNormalizedPresetConfig {
  path: null | UrlConfig
  target: null | object
  handler: null | symbol | TNonemptyString | TResponseHandler<any>
  preset: null | TNonemptyString | EndpointPresetConfig
}

/**
 * Струкрура заполненная `null` для всех полей {@link TEndpointNormalizedPresetConfig}.
 */
function defaultEndpointPresetConfig (): TEndpointNormalizedPresetConfig {
  return {
    kind: null,
    context: null,
    executor: null,
    preprocessor: null,
    postprocessor: null,
    errorprocessor: null,
    queueKey: null,
    queueLimit: null,
    queuePriority: null,
    queueUnordered: null,
    timeout: null,
    retries: null,
    retryDelay: null,
    requestInit: null,
    headers: null
  }
}

/**
 * Струкрура заполненная `null` для всех полей {@link TEndpointNormalizedOptionsConfig}.
 */
function defaultEndpointOptionsConfig (): TEndpointNormalizedOptionsConfig {
  return Object.assign(defaultEndpointPresetConfig(), {
    path: null,
    target: null,
    handler: null,
    preset: null
  })
}

export {
  type THttpRequestMethod,
  requestBaseConfigProps,
  type TRequestBaseCongigKey,
  type TRequestBaseInit,
  type TRequestInit,
  type TRequestBaseOptions,
  type TRequestOptions,
  BASE_MIDDLEWARE,
  type TBaseMiddleware,
  type TResponseHandler,
  type TEndpointBaseConfig,
  type TEndpointPartPathConfig,
  type TEndpointPartRequestInitConfig,
  type TEndpointPartHandlerConfig,
  type TEndpointPartPresetConfig,
  type TEndpointOptionsConfig,
  type TEndpointPresetConfig,
  type TEndpointNormalizedBaseConfig,
  type TEndpointNormalizedPresetConfig,
  type TEndpointNormalizedOptionsConfig,
  defaultEndpointPresetConfig,
  defaultEndpointOptionsConfig
}
