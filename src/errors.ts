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

/** Коды ошибок. */
const errorCodes = Object.freeze({
  UnknownError: 0,
  LogicError: 1,
  ConfigureError: 2,
  //
  MethodAccessError: 3,
  ProtocolError: 4,
  StatusError: 5,
  MissingRecipientError: 6,
  //
  DataTypeError: 7,
  PackError: 8,
  UnpackError: 9,
  FrameEncodeError: 10,
  FrameDecodeError: 11,
  //
  ConnectionError: 12,
  SendError: 13,
  ReceiveError: 14,
  //
  InterruptError: 15,
  AbortError: 16,
  TimeoutError: 17,
} as const)
/** Коды ошибок. */
type TErrorCodes = typeof errorCodes
/** Коды ошибок. */
type TErrorCode = TErrorCodes[keyof TErrorCodes]

const code2Name = Object.freeze(new Map(Object.entries(errorCodes).map(([name, code]) => [code, name])))
function errorNameByCode (code: TErrorCode): string {
  const name = code2Name.get(code)
  return `ApiRouter.${name ?? ''}`
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
  if (!code2Name.has(err.code)) {
    err.code = 0
  }
  const name = errorNameByCode(err.code)
  if (err.name !== name) {
    err.name = name
  }
  return err as T
}

/**
 * Детали ошибки с кодом и описанием.
 */
interface IErrorDetail extends IErrorDetail_<TErrorCode> {
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
interface IErrorLike extends IErrorLike_<TErrorCode>, IErrorDetail { }

/**
 * Предопределенные описания ошибок.
 */
const errorDetails = Object.freeze({
  UnknownError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.UnknownError),
      code: errorCodes.UnknownError,
      message,
      cause
    })
  },
  LogicError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.LogicError),
      code: errorCodes.LogicError,
      message,
      cause
    })
  },
  ConfigureError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ConfigureError),
      code: errorCodes.ConfigureError,
      message,
      cause
    })
  },
  MethodAccessError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.MethodAccessError),
      code: errorCodes.MethodAccessError,
      message,
      cause
    })
  },
  ProtocolError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ProtocolError),
      code: errorCodes.ProtocolError,
      message,
      cause
    })
  },
  StatusError (status: number, url: string, message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.StatusError),
      code: errorCodes.StatusError,
      status,
      url,
      message,
      cause
    })
  },
  MissingRecipientError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.MissingRecipientError),
      code: errorCodes.MissingRecipientError,
      message,
      cause
    })
  },
  DataTypeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.DataTypeError),
      code: errorCodes.DataTypeError,
      message,
      cause
    })
  },
  PackError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.PackError),
      code: errorCodes.PackError,
      message,
      cause
    })
  },
  UnpackError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.UnpackError),
      code: errorCodes.UnpackError,
      message,
      cause
    })
  },
  FrameEncodeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.FrameEncodeError),
      code: errorCodes.FrameEncodeError,
      message,
      cause
    })
  },
  FrameDecodeError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.FrameDecodeError),
      code: errorCodes.FrameDecodeError,
      message,
      cause
    })
  },
  ConnectionError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ConnectionError),
      code: errorCodes.ConnectionError,
      message,
      cause
    })
  },
  SendError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.SendError),
      code: errorCodes.SendError,
      message,
      cause
    })
  },
  ReceiveError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.ReceiveError),
      code: errorCodes.ReceiveError,
      message,
      cause
    })
  },
  InterruptError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.InterruptError),
      code: errorCodes.InterruptError,
      message,
      cause
    })
  },
  AbortError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.AbortError),
      code: errorCodes.AbortError,
      message,
      cause
    })
  },
  TimeoutError (message?: undefined | null | string, cause?: undefined | null | unknown): IErrorLike {
    return createErrorLike({
      name: errorNameByCode(errorCodes.TimeoutError),
      code: errorCodes.TimeoutError,
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
  errorCodes,
  type TErrorCodes,
  type TErrorCode,
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
