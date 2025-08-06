import {
  // type TErrorLevel,
  type IErrorDetail as IErrorDetail_,
  type IErrorLike as IErrorLike_,
  // type IErrorLikeCollection,
  // ErrorLikeProto,
  BaseError,
  // ErrorLikeCollection,
  // captureStackTrace,
  createErrorLike,
  ensureErrorLike as ensureErrorLike_,
  // isErrorLike,
  // safeAnyToString,
  // safeGetStringOf,
  // errorDetailToList,
  // errorDetailToString,
  // nativeErrorToString,
  // errorToString
} from 'js-base-error'

const _errorNames = [
  'ApiRouter.UnknownError', 'ApiRouter.LogicError', 'ApiRouter.ConfigureError',
  'ApiRouter.MethodAccessError', 'ApiRouter.ProtocolError', 'ApiRouter.StatusError',
  'ApiRouter.MissingRecipientError', 'ApiRouter.DataTypeError', 'ApiRouter.PackError',
  'ApiRouter.UnpackError', 'ApiRouter.FrameEncodeError', 'ApiRouter.FrameDecodeError',
  'ApiRouter.ConnectionError', 'ApiRouter.SendError', 'ApiRouter.ReceiveError',
  'ApiRouter.InterruptError', 'ApiRouter.AbortError', 'ApiRouter.TimeoutError'
] as const

type TErrorName = (typeof _errorNames)[number] // 'ApiRouter.UnknownError' | 'ApiRouter.LogicError' | 'ApiRouter.ConfigureError' | 'ApiRouter.MethodAccessError' | 'ApiRouter.ProtocolError' | 'ApiRouter.StatusError' | 'ApiRouter.MissingRecipientError' | 'ApiRouter.DataTypeError' | 'ApiRouter.PackError' | 'ApiRouter.UnpackError' | 'ApiRouter.FrameEncodeError' | 'ApiRouter.FrameDecodeError' | 'ApiRouter.ConnectionError' | 'ApiRouter.SendError' | 'ApiRouter.ReceiveError' | 'ApiRouter.InterruptError' | 'ApiRouter.AbortError' | 'ApiRouter.TimeoutError'

/**
 * Проверяет, является ли имя ошибки допустимым.
 *
 * @param name Предполагаемое имя ошибки.
 */
function isErrorName (name: any): name is TErrorName {
  return _errorNames.includes(name)
}

function _wrapErrorLikeWithCause (cause: object): IErrorLike {
  return createErrorLike({
    name: 'ApiRouter.UnknownError',
    cause
  })
}

/**
 * Оборачивает ошибку в тип {@link IErrorLike}, если она еще не обернута, проверяет или устанавливает допустимый код
 * {@link IErrorDetail.code} и имя ошибки {@link IErrorDetail.name}.
 *
 * @param maybeError Один из вариантов {@link ApiRouterError} или {@link IErrorDetail} или {@link IErrorLike}.
 *
 * Эта функция применяется для пользовательских валидаторов возвращающих ошибки, которые могут быть простыми объектами
 * или недопустимыми типами.
 */
function ensureErrorLike<T extends IErrorLike> (maybeError: any): T {
  const err = ensureErrorLike_(maybeError)
  if (!isErrorName(err.name)) {
    return _wrapErrorLikeWithCause(err) as T
  }
  return err as T
}

/**
 * Детали ошибки с кодом и описанием.
 */
interface IErrorDetail extends IErrorDetail_ {
  /**
   * Статус ответа.
   */
  status?: number
  /**
   * Url запроса.
   */
  url?: string
  /**
   * Может присутствовать в теле запроса при ошибках сервера, когда {@link Response.ok} не равен `true`.
   * Такие ответы могут быть прочитаны `Middleware` и добавлены в это поле.
   */
  data?: unknown
}

/**
 * Базовый интерфейс деталей ошибок.
 */
interface IErrorLike extends IErrorLike_, IErrorDetail {
  status?: number
  url?: string
  data?: unknown
}

/**
 * Предопределенные описания ошибок.
 */
const errorDetails = Object.freeze({
  UnknownError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.UnknownError',
      message,
      cause
    })
  },
  LogicError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.LogicError',
      message,
      cause
    })
  },
  ConfigureError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.ConfigureError',
      message,
      cause
    })
  },
  MethodAccessError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.MethodAccessError',
      message,
      cause
    })
  },
  ProtocolError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.ProtocolError',
      message,
      cause
    })
  },
  StatusError (status: number, url: string, message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.StatusError',
      status,
      url,
      message,
      cause
    })
  },
  MissingRecipientError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.MissingRecipientError',
      message,
      cause
    })
  },
  DataTypeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.DataTypeError',
      message,
      cause
    })
  },
  PackError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.PackError',
      message,
      cause
    })
  },
  UnpackError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.UnpackError',
      message,
      cause
    })
  },
  FrameEncodeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.FrameEncodeError',
      message,
      cause
    })
  },
  FrameDecodeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.FrameDecodeError',
      message,
      cause
    })
  },
  ConnectionError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.ConnectionError',
      message,
      cause
    })
  },
  SendError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.SendError',
      message,
      cause
    })
  },
  ReceiveError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.ReceiveError',
      message,
      cause
    })
  },
  InterruptError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.InterruptError',
      message,
      cause
    })
  },
  AbortError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.AbortError',
      message,
      cause
    })
  },
  TimeoutError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: 'ApiRouter.TimeoutError',
      message,
      cause
    })
  }
} as const)

/**
 * Базовый класс ошибок.
 */
abstract class ApiRouterError extends BaseError<IErrorLike> { }

/**
 * Неидентифицированная ошибка.
 */
class UnknownError extends ApiRouterError { }

/**
 * Логическая ошибка.
 */
class LogicError extends ApiRouterError { }

/**
 * Ошибки связанные с конфигурированием классов.
 *
 * Примером такой ошибки может быть отсутствие обязательного поля пути маршрута.
 */
class ConfigureError extends ApiRouterError { }

/**
 * Доступ к методу запрещен.
 *
 * Например класс требует явного получения соединения, но была попытка отправить запрос.
 */
class MethodAccessError extends ApiRouterError { }

/**
 * Ошибки связанные с неверными или неполными параметрами запроса.
 *
 * Примером такой ошибки могут быть не до конца заполненные обязательные поля запроса.
 */
class ProtocolError extends ApiRouterError { }

/**
 * Любая ошибка, когда {@link Response.ok} не равен `true`.
 */
class StatusError extends ApiRouterError { }

/**
 * Для этого сообщения требуется получатель.
 *
 * Эта ошибка означает что сообщение получено, распаковано и адресовано конкретному получателю, но получатель не найден.
 * Чаще всего такая ошибка может быть в реализациях двунаправленного соединения.
 */
class MissingRecipientError extends ApiRouterError { }

/**
 * Ошибки связанные с типом и/или форматом данных как отправляемые клиентом, так и получаемые для распаковки.
 *
 * Эта ошибка может расширяться более конкретизированными.
 */
class DataTypeError extends ApiRouterError { }

/**
 * Ошибки связанные с упаковкой данных в тело запроса:
 *
 *  + Для HTTP-запросов это может ошибка преобразования JSON к строке.
 *  + Для бинарных данных - ошибка упаковки пользовательских данных в один бинарный фрейм.
 */
class PackError extends DataTypeError { }

/**
 * Ошибка распаковки данных принятого запроса:
 *
 *  + Для HTTP-запросов это может быть ошибка чтения `response.json()`.
 *  + Для бинарных фреймов - ошибка распаковки в ожидаемую структуру.
 */
class UnpackError extends DataTypeError { }

/**
 * Ошибка кодирования фрейма протоколом `MFP`.
 */
class FrameEncodeError extends PackError { }

/**
 * Ошибка декодирования фрейма протоколом `MFP`.
 */
class FrameDecodeError extends UnpackError { }

/**
 * Любая ошибка соединения. Это может быть сбой в запросе `fetch()` или разрыв `WebSocket` соединения.
 */
class ConnectionError extends ApiRouterError { }

/**
 * Что-то произошло при попытке отправить запрос.
 */
class SendError extends ConnectionError { }

/**
 * Ошибка при чтении данных ответа. Например обрыв соединения.
 */
class ReceiveError extends ConnectionError { }

/**
 * Ошибки связанные с прерывание запросов по любым причинам:
 *
 *  + Пользовательские прерывания методами.
 *  + Отказы на уровне реализации.
 *  + `AbortSignal`.
 *  + Установленные `timeout`.
 *
 * Эта ошибка может расширяться более конкретизированными.
 */
class InterruptError extends ApiRouterError { }

/**
 * Ошибки вызванные прерыванием запроса при использовании {@link AbortSignal}.
 */
class AbortError extends InterruptError { }

/**
 * Ошибки вызванные прерыванием запроса для установленного `timeout`.
 */
class TimeoutError extends InterruptError { }

export {
  type TErrorName,
  isErrorName,
  ensureErrorLike,
  type IErrorDetail,
  type IErrorLike,
  errorDetails,
  ApiRouterError,
  // Логические ошибки
  UnknownError,
  LogicError,
  ConfigureError,
  // Ошибки связанные с запросами, неправильным использованием протокола и ответами.
  MethodAccessError,
  ProtocolError,
  StatusError,
  MissingRecipientError,
  // Ошибки типа данных
  DataTypeError,
  PackError,
  UnpackError,
  FrameEncodeError,
  FrameDecodeError,
  // Ошибки связанные с соединением, неверным прокотолом и ответом
  ConnectionError,
  SendError,
  ReceiveError,
  // Ошибки прерывания запроса
  InterruptError,
  AbortError,
  TimeoutError
}
