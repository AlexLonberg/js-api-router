/**
 * Поддерживаемые(реализованные) подпротоколы `MultiplexFrameProtocol`.
 */
const MFP_FRAME_TYPES = Object.freeze({
  /**
   * Отправить/получить подтверждение получения сообщения противоположной стороной.
   */
  service: 1,
  /**
   * Отправить/получить сообщение.
   */
  message: 2,
  /**
   * Отправить/получить запрос.
   */
  request: 3,
  /**
   * Отправить/получить бинарные данные.
   */
  binary: 4,
  /**
   * Отправить/получить ответ на запрос `request`.
   */
  response: 5
} as const)
/**
 * Поддерживаемые(реализованные) подпротоколы `MultiplexFrameProtocol`.
 */
type TMfpFrameTypes = typeof MFP_FRAME_TYPES
/**
 * Поддерживаемые(реализованные) подпротоколы `MultiplexFrameProtocol`.
 */
type TMfpFrameType = TMfpFrameTypes[keyof TMfpFrameTypes]

/**
 * Коды служебного фрейма или локального сообщения.
 */
const MFP_SERVICE_CODES = Object.freeze({
  /**
   * Резервный. Пустая заглушка для типа.
   */
  none: 0,
  /**
   * Получение сообщения подтверждено. В сообщение указан идентификатор полученного сообщения.
   * Этот же код возвращается на сообщение PING.
   */
  ack: 1,
  /**
   * Нами получен запрос(protocol:request), но приложение не подготовило ответ в отведенное время для возврата
   * ответа protocol:response.
   *
   * **Note:** Почему может возникнуть такая ошибка? Слой реализации протокола может отличаться от приложения и быть
   * настроен на собственный timeout независимо от приложения.
   *
   * Отправитель этого сообщения удаляет ожидающие сообщения, а получатель должен вернуть пользователю ошибку.
   */
  timeout: 2,
  /**
   * Обратная сторона требует прервать передачу сообщений с приложенными файлами(protocol:binary) или
   * ответами(protocol:response) для указанного идентификатора.
   *
   * Реализация протокола должна удалить задачи ожидающие завершение сборки целостного сообщения(binary) или задачу
   * ожидающую ответа от приложения(response), и сообщить приложению об игнорировании этих запросов.
   */
  abort: 3,
  /**
   * Нами получено сообщение (protocol:service/binary/response) для которого отсутствует получатель.
   *
   * В случае с `binary` это должно быть предварительное сообщение `message`.
   * В случае `response` должен быть живой контекст `request`.
   * В случае подтверждений это может быть любое сообщение.
   *
   * Этот код необязателен и может как возвращаться инициатору запроса, так и игнорироваться.
   * Возврат этого кода может быть определен параметрами протокола.
   */
  unknown: 4,
  /**
   * PING, на который должен быть отправлен PONG. Код для PONG это `ack`.
   */
  ping: 7,
  // /**
  //  * Внутренний код(не передается по сети).
  //  *
  //  * Ошибка в результате кодирования сообщения или сетевого запроса(сокет упал).
  //  */
  // failed: 6,
  // /**
  //  * Внутренний код(не передается по сети).
  //  *
  //  * Пришло сообщение которое не удалось декодировать.
  //  */
  // error: 7
})
/**
 * Коды служебного фрейма.
 */
type TMfpServiceCodes = typeof MFP_SERVICE_CODES
/**
 * Коды служебного фрейма.
 */
type TMfpServiceCode = TMfpServiceCodes[keyof TMfpServiceCodes]

interface TMfpPartBase {
  /**
   * Уникальный идентификатор сообщения в диапазоне `1 - 0xFFFF_FFFF`.
   */
  readonly id: number
  /**
   * + Для исходящего сообщения: Добавить к сообщению контрольную сумму.
   * + Для входящего: Сообщение было доставлено с контрольной сумой и верифицировано.
   */
  readonly checksum: boolean
}

interface TMfpPartData {
  /**
   * Пользовательские данные от клиента и обратно.
   *
   * Автоматически установит флаг **0b0001**.
   */
  readonly data: null | ArrayBuffer
}

interface TMfpPartBinaries {
  /**
   * Бинарные данные от клиента и обратно.
   *
   * Автоматически установит флаг **0b0110**.
   */
  readonly binaries: null | Map<number, ArrayBuffer>
}

interface TMfpPartExpected {
  /**
   * Ключи ожидаемых файлов которых высылаются в `protocol:binary` и прикрепляются к текущему сообщению.
   *
   * Автоматически установит флаг **0b0010**.
   *
   * **Note:** Ключи файлов не могут быть указаны одновременно с {@link binaries} и будут проигнорированы.
   */
  readonly expected: null | Set<number>
}

interface TMfpPartStreaming {
  /**
   * Флаг **0b0100**.
   *
   * + Для входящего сообщения `protocol:message`: Если установлено, значит отправитель будет присылать бинарные данные
   *   в следующих сообщениях `protocol:binary`.
   * + Для исходящего `protocol:message`: Если установлено и нет {@link TMfpPartBinaries.binaries} или
   *   {@link TMfpPartExpected.expected}, значит протокол будет ожидать бинарных данных сформированных в
   *   `protocol:binary`.
   * + Для сообщения `protocol:binary`: Поле скопировано из предварительного сообщения.
   *
   * Для сообщений имеющих поля {@link TMfpPartBinaries.binaries} или
   * {@link TMfpPartExpected.expected} это всегда `false`.
   */
  readonly streaming: boolean
}

interface TMfpPartNeedAck {
  /**
   * Флаг **0b1000**.
   *
   * + Для входящего сообщения: Если установлено, значит запросу было отправлено подтверждение получения сообщения.
   *   Это не означает что инициатор запроса получил подтверждение.
   * + Для исходящего: Если установлено, получатель вернет результат получения запроса. Это означает что сообщение
   *   декодировано и передано приложению получателя.
   */
  readonly needAck: boolean
}

interface TMfpPartBin {
  /**
   * Идентификатор сообщения к которому следует приложить файл в диапазоне `1 - 0xFFFF_FFFF`.
   */
  readonly refId: number
  /**
   * Устанавливается, если предварительное сообщение определено с {@link TMfpPartExpected.expected} и есть {@link bin}.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  readonly hasExpected: boolean
  /**
   * Устанавливается, если предварительное сообщение определено с флагом {@link TMfpPartStreaming.streaming} и есть {@link bin}.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  readonly hasStreaming: boolean
  /**
   * Устанавливается, если отправитель не привязывает это сообщение к файлам. Такое сообщение может оцениваться как
   * данные и, например, передавать ошибку в последнем сообщение. Реализация протокола может использовать этот подтип
   * как в обычном сообщении для json-данных.
   *
   * Поля `hasExpected/hasStreaming/hasData` взаимоисключающие.
   */
  readonly hasData: boolean
  /**
   * Номер файла в диапазоне `0 - 0xFFFF_FFFF`.
   *
   * Если это сообщение адресовано предварительно анонсированным файлам {@link TMfpPartExpected.expected},
   * этот номер будет совпадать с одним из значений набора.
   *
   * Для подтипа сообщения не относящихся к файлам(флаг 0b0110) или если данных нет, это поле должно быть проигнорировано.
   */
  readonly key: number
  /**
   * Файл в виде необработанных данных. Гарантируется если есть один из флагов `hasExpected/hasStreaming/hasData`.
   */
  readonly bin: null | ArrayBuffer
  /**
   * Завершающее сообщение с последними бинарными данными или без.
   *
   * Не устанавливать флаг **0b0001** продолжения потоковой передачи.
   */
  readonly final: boolean
}

/**
 * Служебный фрейм `protocol:service`.
 */
interface TMfpService extends TMfpPartBase {
  readonly type: TMfpFrameTypes['service']
  /**
   * Код служебного сообщения.
   */
  readonly code: Exclude<TMfpServiceCode, TMfpServiceCodes['none']>
  /**
   * Идентификатор сообщения запросившего подтверждение.
   *
   * `id` будет скопирован из входящего сообщения и отправлен обратно автоматически.
   * Для клиента отправившего сообщение это будет `id` его запроса.
   *
   * Для сообщений не предполагающих `refId`(внутренние ошибки) это поле равно `0`.
   */
  readonly refId: number
  /**
   * Принадлежность {@link refId}. Флаг `0b00001000`.
   *
   * **Help:** Каждое сообщение генерирует уникальный `id` в диапазоне `1 - 0xFFFF_FFFF`. Идентификаторы двух сторон
   * соединения генерируются локально и пересекаются. Отправитель сервисного сообщения должен сообщить о принадлежности
   * `refId`. Если `id` первонального сообщения
   *
   * @example
   * Сообщение запроса `request` генерирует `id:1234`. Для отмены запроса со стороны отправителя требуется отправить
   * повторное сообщение, с явным указанием, что сообщение следует искать во входящих:
   *
   * ```json
   * {
   *   id:4567,
   *   refId:1234,
   *   ownRefId:true,
   *   abort:true
   * }
   * ```
   * Со стороны получателя запроса, когда требуется вернуть подтверждение на флаг `needAck` или отменить запрос,
   * необходимо вернуть обратное сообщение и указать что `refId` принадлежал стороне инициировавшей запрос,
   * и сообщение следует искать в исходящих:
   *
   * ```json
   * {
   *   id:7890,
   *   refId:1234,
   *   ownRefId:false,
   *   timeout:true
   * }
   */
  readonly ownRefId: boolean
  // /**
  //  * Объект является заглушкой для типа и не несет информации.
  //  */
  // readonly none: boolean
  //
  /**
   * Смотри {@link TMfpServiceCodes.ack}
   */
  readonly ack: boolean
  /**
   * Смотри {@link TMfpServiceCodes.timeout}
   */
  readonly timeout: boolean
  /**
   * Смотри {@link TMfpServiceCodes.abort}
   */
  readonly abort: boolean
  /**
   * Смотри {@link TMfpServiceCodes.unknown}
   */
  readonly unknown: boolean
  /**
   * Смотри {@link TMfpServiceCodes.ping}
   */
  readonly ping: boolean
}

/**
 * Входящие и исходящие сообщения `protocol:message` полностью идентичны.
 */
interface TMfpMessage extends
  TMfpPartBase,
  TMfpPartData,
  TMfpPartBinaries,
  TMfpPartExpected,
  TMfpPartStreaming,
  TMfpPartNeedAck {
  readonly type: TMfpFrameTypes['message']
}

/**
 * Входящие и исходящие запросы `protocol:request` полностью идентичны сообщениям `protocol:message`.
 *
 * В запросах нельзя использовать флаг `0x0100` - начала вещания потоковой передачи и отправки файлов в нескольких
 * сообщениях `0x0010`. Несмотря на ограничения, можно отправить и получить несколько файлов в одном запросе.
 * Думай о запросах как об аналоге POST.
 *
 * Получив это сообщение клиент обязан ответить.
 */
interface TMfpRequest extends
  TMfpPartBase,
  TMfpPartData,
  TMfpPartBinaries,
  TMfpPartNeedAck {
  readonly type: TMfpFrameTypes['request']
}

/**
 * Входящие и исходящие сообщения бинарных данных `protocol:binary` полностью идентичны.
 */
interface TMfpBinary extends
  TMfpPartBase,
  TMfpPartBin,
  TMfpPartNeedAck {
  readonly type: TMfpFrameTypes['binary']
}

/**
 * Входящие и исходящие сообщения ответов `protocol:response` полностью идентичны.
 *
 * Ответы не могут использовать флаг `0x0100` или `0x0010`, как и в случае с {@link TMfpRequest}.
 * Ответ с файлами может быть отправлен только в одном сообщении `0x0110`.
 * Ответы могут получить подтверждения своей доставки, как и другие сообщения.
 */
interface TMfpResponse extends
  TMfpPartBase,
  TMfpPartData,
  TMfpPartBinaries,
  TMfpPartNeedAck {
  readonly type: TMfpFrameTypes['response']
  /**
   * Для клиента отправившего запрос это будет `id` его запроса.
   * Клиент отвечающий за запрос, должен установить `id` запроса на который он отвечает.
   */
  readonly refId: number
}

type TMfpDecodedFrame =
  TMfpService |
  TMfpMessage |
  TMfpRequest |
  TMfpBinary |
  TMfpResponse

/**
 * Декодированный заголовок сообщения.
 *
 * **Важно:** Для разных типов сообщений следует использовать свой набор флагов.
 */
interface TMfpDecodedHeader {
  /**
   * Тип подпротокола.
   */
  readonly type: TMfpFrameType
  /**
   * Уникальный идентификатор сообщения.
   */
  readonly id: number
  /**
   * Только для служебного сообщения.
   *
   * Последние три бита заголовка.
   */
  readonly code: number
  /**
   * Только для служебного сообщения.
   *
   * Бит `0b00001000` означающий кем первоначально сгенерирован `refId`.
   *
   *  + Для отправителя: Если первоначальный `refId` сгенерирован отправителем, последний отправляет команду с `ownRefId:true`.
   *  + Для получателя: Если получен `ownRefId:true`, то сообщения нужно искать в полученных этим отправителем.
   */
  readonly ownRefId: boolean
  /**
   * Сообщение содержит контрольную сумму.
   */
  readonly hasChecksum: boolean
  /**
   * Сообщение требует подтверждения.
   */
  readonly needAck: boolean
  /**
   * Сообщение содержит данные.
   */
  readonly hasData: boolean
  /**
   * Сообщение содержит карту файлов и бинарные данные.
   */
  readonly hasBinaries: boolean
  /**
   * Сообщение содержит номера анонсированных файлов без самих файлов.
   * Файлы будут приходить следующими сообщениями.
   *
   * **Важно:** Это поле следует проверять после `hasBinaries`
   */
  readonly hasExpected: boolean
  /**
   * Сообщение имеет флаг начала передачи бинарных файлов без предварительного уведомления об их количестве.
   * Файлы будут приходить следующими сообщениями.
   */
  readonly hasStreaming: boolean
}

export {
  MFP_FRAME_TYPES,
  type TMfpFrameTypes,
  type TMfpFrameType,
  MFP_SERVICE_CODES,
  type TMfpServiceCodes,
  type TMfpServiceCode,
  type TMfpPartBase,
  type TMfpPartData,
  type TMfpPartBinaries,
  type TMfpPartExpected,
  type TMfpPartStreaming,
  type TMfpPartNeedAck,
  type TMfpPartBin,
  type TMfpService,
  type TMfpMessage,
  type TMfpRequest,
  type TMfpBinary,
  type TMfpResponse,
  type TMfpDecodedFrame,
  type TMfpDecodedHeader
}
