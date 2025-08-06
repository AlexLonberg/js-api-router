import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type interfaceImplements, type interfaceDefineImplementInterfaces,
  interfaceDefineHasInstanceMarker
} from 'ts-interface-core'
import type { EndpointConfig } from '../configs/EndpointConfig.js'
import type { TResponse } from '../types.js'

/**
 * Стадия выполнения запроса.
 */
const REQUEST_STAGES = Object.freeze({
  /**
   * Контекст запроса был создан, но не вызвана `run()`. Таймаут, если задан, пока не работает.
   */
  none: 0,
  /**
   * Запрос стартовал. Таймаут, если задан, запущен. Запрос может попасть в очередь.
   */
  started: 1,
  /**
   * Предварительная обработка до вызова основного исполнителя.
   */
  preprocessing: 2,
  /**
   * Запрос совершается основным исполнителем `http`, `ws` и т.п.
   * Для потоковых запросов `ws` этот этап является циклическим вместе с 'postprocessing'
   */
  pending: 3,
  /**
   * Постобработка, если предыдущие этапы успешно завершены.
   * Для потоковых запросов `ws` этот этап является циклическим вместе с 'pending'.
   */
  postprocessing: 4,
  /**
   * Запрос полностью завершен и не может быть повторно вызван.
   * Для потоковых запросов `ws` это означает закрытие соединения по требованию клиента.
   */
  finished: 5
} as const)
/**
 * Стадия выполнения запроса.
 */
type TRequestStages = typeof REQUEST_STAGES
/**
 * Стадия выполнения запроса.
 */
type TRequestStage = TRequestStages[keyof TRequestStages]

/**
 * Статус запроса.
 */
const REQUEST_STATUSES = Object.freeze({
  /**
   * Первоначальная установка, когда результат еще ожидается.
   */
  none: 0,
  /**
   * Остановка по требованию пользователя: AbortSignal
   */
  aborted: 1,
  /**
   * Остановка по timeout, если запрос находился до стадии 'pending' включительно.
   */
  timeout: 2,
  /**
   * Успешное завершение.
   */
  ok: 3,
  /**
   * Ошибка запроса.
   */
  error: 4
} as const)
/**
 * Статус запроса.
 */
type TRequestStatuses = typeof REQUEST_STATUSES
/**
 * Статус запроса.
 */
type TRequestStatus = TRequestStatuses[keyof TRequestStatuses]

const PASSTHROUGH_MARKER = Symbol('PASSTHROUGH_MARKER')

/**
 * Контекста выполнения запросов.
 *
 * **Note:** Этот класс можно реализовать используя {@link interfaceImplements()} или для объекта {@link interfaceDefineImplementInterfaces()}.
 * Пример: `interfaceImplements(cls, ContextLike)`.
 */
abstract class ContextLike<T extends EndpointConfig = EndpointConfig, R = any> {
  /**
   * Уникальны тип класса {@link Context}.
   */
  abstract readonly kind: string
  /**
   * Конфигурация конечной точки.
   */
  abstract readonly config: T
  /**
   * Стадия выполнения запроса.
   */
  abstract readonly stage: TRequestStage
  /**
   * Статус запроса.
   */
  abstract readonly status: TRequestStatus
  /**
   * Сигнал, который может быть использован {@link MiddlewareLike}.
   *
   * **Note:** Пользователькие `AbortSignal` могут быть обернуты в собственные контроллеры.
   */
  abstract readonly abortSignal: null | AbortSignal
  /**
   * Запрос завершен или отменен - это может быть `AbortSignal` или `timeout`.
   */
  abstract isCancelled (): boolean
  /**
   * Функция выполняющая запрос без возвращаемого результата. Результат может быть получен через установленный в конфигурации обработчик.
   *
   * **Note:** Метод не должен вызывать ошибок.
   */
  abstract run (): void
  /**
   * Функция выполняющая запрос и возвращающая результат.
   *
   * **Note:** Независимо от того был ли вызван ранее {@link run()}, этот метод должен вернуть `Promise` или кешированный результат.
   * Метод не должен вызывать ошибок.
   */
  abstract result (): TResponse<R> | Promise<TResponse<R>>
  /**
   * {@link MiddlewareLike} могут вызвать этот метод вместо возврата трансформированных данных, когда данные не изменялись.
   *
   * **Note:** Реализация этого метода должна вернуть {@link PASSTHROUGH_MARKER}.
   */
  abstract passthrough (): any
}
interfaceDefineHasInstanceMarker(ContextLike)

/**
 * Конструктор {@link ContextLike}.
 */
interface TContextConstructor<T extends ContextLike = ContextLike, E extends EndpointConfig = EndpointConfig, P extends Record<string, any> = Record<string, any>> {
  readonly kind: string
  new(endpoint: E, options: P): T
}

/**
 * Обертка над конструктором реализации {@link ContextLike}.
 *
 * **Note:** Этот тип можно реализовать используя {@link interfaceImplements()} или для объекта {@link interfaceDefineImplementInterfaces()}.
 */
abstract class ContextFactoryLike<T extends ContextLike = ContextLike, E extends EndpointConfig = EndpointConfig, P extends Record<string, any> = Record<string, any>> {
  abstract readonly kind: string
  /**
   * Создает и возвращает инстанс {@link ContextLike}.
   */
  abstract create (endpoint: E, options: P): T
}
interfaceDefineHasInstanceMarker(ContextFactoryLike)

export {
  REQUEST_STAGES,
  type TRequestStages,
  type TRequestStage,
  REQUEST_STATUSES,
  type TRequestStatuses,
  type TRequestStatus,
  PASSTHROUGH_MARKER,
  ContextLike,
  type TContextConstructor,
  ContextFactoryLike
}
