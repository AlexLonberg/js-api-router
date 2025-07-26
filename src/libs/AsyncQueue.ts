import { type TNonNegInteger, type TPositiveInteger, isNonNegInteger, isPositiveInteger } from '../types.js'
import { safeToJson } from '../utils.js'

const MIN_QUEUE_PRIORITY: TNonNegInteger = 0 as TNonNegInteger
const MAX_QUEUE_PRIORITY: TNonNegInteger = Number.MAX_SAFE_INTEGER as TNonNegInteger

type TNode = {
  readonly task: (() => any | Promise<any>)
  readonly priority: TNonNegInteger
  prev: null | TNode
  next: null | TNode
  removed?: boolean
}

class AsyncQueue {
  protected readonly _key: string
  protected _head: null | TNode = null
  protected _limit: TPositiveInteger
  protected _counter: number = 0

  constructor(key: string, limit?: undefined | null | number | TPositiveInteger) {
    this._key = key
    this._limit = isPositiveInteger(limit) ? limit : (1 as TPositiveInteger)
  }

  get key (): string {
    return this._key
  }

  get limit (): TPositiveInteger {
    return this._limit
  }

  get counter (): number {
    return this._counter
  }

  protected _remove (node: TNode): void {
    if (node.removed) {
      return
    }
    node.removed = true
    if (node.next) {
      node.next.prev = node.prev
    }
    if (node.prev) {
      node.prev.next = node.next
    }
    // Если нет prev, то next становится головой списка или очищается при next === null
    else {
      this._head = node.next
    }
  }

  protected async _run (node: TNode): Promise<void> {
    ++this._counter
    await Promise.resolve()
    try {
      await node.task()
    } catch (e) {
      console.error(`[ApiRouter.AsyncQueue] key:${safeToJson(this._key)}`, e)
    }
    this._remove(node)
    --this._counter
    if (this._head && this._limit > this._counter) {
      this._run(this._head)
    }
  }

  protected _insertWith (next: null | TNode, node: TNode): void {
    let prev: null | TNode = null
    while (next && next.priority >= node.priority) {
      prev = next
      next = next.next
    }
    node.prev = prev
    node.next = next
    if (prev) {
      prev.next = node
    }
    else {
      this._head = node
    }
    if (next) {
      next.prev = node
    }
  }

  protected _insert (node: TNode): boolean {
    if (this._head) {
      this._insertWith(this._head, node)
      return (this._limit > this._counter) ? true : false
    }
    this._head = node
    return true // Если нет очереди, запускаем мгновенно
  }

  protected _wrapTask (task: (() => any | Promise<any>), priority: TNonNegInteger, abortSignal: AbortSignal): TNode {
    let ok: (() => any)
    const promise = new Promise<void>((resolve) => ok = resolve)
    // Варианты удаления:
    //  + После нормального завершения вызывается finally(resolve), удаляет слушателя, задачу и разрешает Promise.
    //  + При ошибке - результат как и выше finally(resolve)
    //  + При AbortSignal resolve() запускается по сигналу.
    //  + После выполнения всегда вызывается _remove(), но флаг removed:true предотвращает повторный поиск
    const resolve = () => {
      abortSignal.removeEventListener('abort', resolve)
      if (!node.removed) {
        this._remove(node) // _remove() сама установит removed:true
        ok()
      }
    }
    abortSignal.addEventListener('abort', resolve, { once: true })
    // Цепляем node к listener()
    const node: TNode = {
      task: () => {
        Promise.resolve(task()).finally(resolve)
        return promise
      },
      priority,
      next: null,
      prev: null,
      removed: false
    }
    return node
  }

  /**
   * Добавляет задачу в очередь.
   *
   * **Важно:** Если не передан `AbortSignal` остановить выполнение уже запущенной задачи не представляется возможным.
   *
   * @param task        Функция, после выполнения которой `task` удаляется из очереди.
   * @param priority    Приоритет выполнения.
   * @param abortSignal Сигнал прерывания. Если `AbortSignal.aborted`, задача игнорируется.
   */
  add (task: (() => any | Promise<any>), priority: TNonNegInteger, abortSignal?: undefined | null | AbortSignal): void {
    if (abortSignal?.aborted) {
      return
    }
    const node = abortSignal ? this._wrapTask(task, priority, abortSignal) : { task, priority, next: null, prev: null }
    if (this._insert(node)) {
      this._run(node)
    }
  }

  /**
   * Повышает лимит очереди.
   *
   * @param limit Лимит.
   */
  setConcurrencyLimit (limit: number): void {
    if (isPositiveInteger(limit)) {
      if (limit > this._limit) {
        this._limit = limit
      }
      else if (limit !== this._limit) {
        console.warn(`[ApiRouter.AsyncQueue] Текущий лимит 'limit:${this._limit}' не может быть понижен до '${limit}'`)
      }
    }
  }
}

/**
 * Реестр {@link AsyncQueue}.
 */
class NamedAsyncQueue {
  protected readonly _queues = new Map<string, AsyncQueue>()

  protected _createQueue (key: string, limit: number): AsyncQueue {
    const queue = new AsyncQueue(key, limit)
    this._queues.set(key, queue)
    return queue
  }

  /**
   * Возвращает или создает новую очередь. Если очередь уже создана, будет проверен и, при необходимости, повышен `limit`.
   *
   * @param key   Уникальное имя очереди.
   * @param limit Лимит.
   */
  getOrCreateQueue (key: string, limit?: undefined | null | number): AsyncQueue {
    const queues = this._queues.get(key)
    if (!queues) {
      return this._createQueue(key, limit ?? 1)
    }
    if (limit) {
      queues.setConcurrencyLimit(limit)
    }
    return queues
  }

  /**
   * Возвращает или создает новую очередь.
   *
   * Этот метод похож на {@link getOrCreateQueue()}, но очередь создается с лимитом по умолчанию `limit:1`.
   */
  getQueue (key: string): AsyncQueue {
    return this._queues.get(key) ?? this._createQueue(key, 1)
  }

  /**
   * Возвращает очередь, если она существует.
   *
   * @param key Уникальное имя очереди.
   */
  tryGet (key: string): null | AsyncQueue {
    return this._queues.get(key) ?? null
  }

  /**
   * Добавляет задачу в именованную очередь. Несуществующая очередь создается с лимитом `limit:1`.
   *
   * **Важно:** Если не передан `AbortSignal` остановить выполнение уже запущенной задачи не представляется возможным.
   *
   * @param key         Уникальное имя очереди.
   * @param task        Функция, после выполнения которой `task` удаляется из очереди.
   * @param priority    Приоритет выполнения.
   * @param abortSignal Сигнал прерывания. Если `AbortSignal.aborted`, задача игнорируется.
   */
  add (key: string, task: (() => any | Promise<any>), priority?: undefined | null | TNonNegInteger, abortSignal?: undefined | null | AbortSignal): void {
    const queue = this._queues.get(key) ?? this._createQueue(key, 1)
    queue.add(task, isNonNegInteger(priority) ? priority : (0 as TNonNegInteger), abortSignal)
  }

  /**
   * **Only development:** Переопределяет поведение счетчика асинхронных очередей, подсчитывает общее количество
   * исполненных задач и логические ошибки.
   *
   * @param callback Функция которая будет вызваться если произошла ошибка. Коды ошибок:
   *   + `0` - Смотри параметр `countingTasks`.
   *   + `1` - Превышен установленный лимит одновременно выполняемых задач `> limit`.
   *   + `2` - Очередь пуста, но счетчик не равен `0`. К этой ошибке следует относится снисходительно из-за
   *           асинхронности, когда счетчик может уменьшаться с небольшой задержкой после удаления задачи из очереди.
   *   + `3` - Сбой счетчика до значения `< 0`.
   * @param interval      Интервал опроса.
   * @param countingTasks Подсчитывать ли общее количество задач. `callback` будет вызываться с `code:0` и только при
   *   изменении счетчиков. Общее количество устанавливается последним параметром.
   *   Без этого параметра `callback` вызывается только при ошибках.
   * @returns Возвращает функцию отключения опроса.
   */
  _onlyDevelopmentTracking (callback: ((key: string, code: 0 | 1 | 2 | 3, message: string, totalCounter?: number) => any), interval: number, countingTasks: boolean): (() => void) {
    type T = AsyncQueue & { readonly _head: null | TNode, readonly _counter: number, readonly __spyTotalCounter__: number, __spyChangedTotalCounter__: boolean }
    // Переопределяем поведение счетчика
    const defined = new WeakSet()
    const defineSpyCounters = (item: T) => {
      if (defined.has(item)) {
        return
      }
      defined.add(item)
      let spyTaskCounter = item._counter
      let spyTotalCounter = spyTaskCounter
      let spyChangedTotalCounter = spyTaskCounter > 0
      Object.defineProperties(item, {
        _counter: {
          get () { return spyTaskCounter },
          set (v) {
            if (v > spyTaskCounter) {
              spyTotalCounter++
              spyChangedTotalCounter = true
            }
            spyTaskCounter = v
          }
        },
        __spyTotalCounter__: {
          get () { return spyTotalCounter },
        },
        __spyChangedTotalCounter__: {
          get () { return spyChangedTotalCounter },
          set (v) { spyChangedTotalCounter = v },
        }
      })
    }
    if (countingTasks) {
      for (const item of this._queues.values() as MapIterator<T>) {
        defineSpyCounters(item)
      }
    }
    const task = () => {
      for (const item of this._queues.values() as MapIterator<T>) {
        const counter = item._counter
        if (counter > item.limit) {
          callback(item.key, 1, `Счетчик имеет значение больше установленного лимита, 'counter:${counter} > limit:${item.limit}'`)
        }
        else if (counter < 0) {
          callback(item.key, 3, `Счетчик имеет значение меньше нуля, 'counter:${counter} < 0'`)
        }
        if (!item._head && counter !== 0) {
          callback(item.key, 2, `Очередь пуста, но счетчик имеет значение отличное от нуля, 'counter:${counter} !== 0'`)
        }
        if (countingTasks) {
          defineSpyCounters(item)
          if (item.__spyChangedTotalCounter__) {
            item.__spyChangedTotalCounter__ = false
            callback(item.key, 0, `Общее количество запущенных задач: ${item.__spyTotalCounter__}`, item.__spyTotalCounter__)
          }
        }
      }
    }
    const id = setInterval(task, interval)
    return (() => clearInterval(id))
  }
}

export {
  MIN_QUEUE_PRIORITY,
  MAX_QUEUE_PRIORITY,
  AsyncQueue,
  NamedAsyncQueue
}
