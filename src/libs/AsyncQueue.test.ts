import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { asyncPause } from 'nodejs-simple-http-server'
import { type TNonNegInteger, isNonNegInteger } from '../types.js'
import {
  AsyncQueue,
  NamedAsyncQueue
} from './AsyncQueue.js'

// Копируем из AsyncQueue.js чтобы не экспортировать закрытый тип
type TNode = {
  readonly task: (() => any | Promise<any>)
  readonly priority: TNonNegInteger
  prev: null | TNode
  next: null | TNode
}

type _AsyncQueue = { _head: null | TNode } & AsyncQueue
type _NamedAsyncQueue = { _queues: Map<string, _AsyncQueue> } & NamedAsyncQueue

// Вспомогательная функция обеспечивающая обязательный тип TNonNegInteger.
// Очередь не проверяет приоритет и должна получить `integer >= 0`
const qPriority = (p?: number) => isNonNegInteger(p) ? p : (0 as TNonNegInteger)

describe('AsyncQueue', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Перехватываем console.error для проверки логирования ошибок
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /**/ })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  test('should create an AsyncQueue with a key', () => {
    const queue = new AsyncQueue('test-key', 1)
    expect(queue.key).toBe('test-key')
  })

  test('should add and execute a single task immediately if queue is empty', async () => {
    const queue = new AsyncQueue('q1', 1) as _AsyncQueue
    const taskMock = vi.fn(() => Promise.resolve())

    queue.add(taskMock, qPriority())
    expect(taskMock).toHaveBeenCalledTimes(0) // Должна быть асинхронной

    await asyncPause(10) // Даем время на выполнение Promise.resolve() и первого _run

    expect(taskMock).toHaveBeenCalledTimes(1)
    expect(queue._head).toBeNull() // Очередь должна быть пуста
  })

  test('should execute tasks sequentially according to priority (higher first)', async () => {
    const queue = new AsyncQueue('q-priority', 1) as _AsyncQueue
    const executionOrder: number[] = []

    const task1 = vi.fn(async () => { await asyncPause(10); executionOrder.push(1) }) // priority 0 (default)
    const task2 = vi.fn(async () => { await asyncPause(10); executionOrder.push(2) }) // priority 10
    const task3 = vi.fn(async () => { await asyncPause(10); executionOrder.push(3) }) // priority 5

    queue.add(task1, qPriority())
    queue.add(task2, qPriority(5))
    queue.add(task3, qPriority(10))

    // Ожидаем завершения всех задач. Так как они последовательны,
    // общее время будет зависеть от их количества и задержек.
    // _run вызывает следующую задачу рекурсивно.
    // Нужно дождаться, пока _head не станет null
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (queue._head === null && task1.mock.calls.length > 0 && task2.mock.calls.length > 0 && task3.mock.calls.length > 0) {
          clearInterval(interval)
          resolve()
        }
      }, 20)
    })

    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1)
    expect(task3).toHaveBeenCalledTimes(1)
    expect(executionOrder).toEqual([1, 3, 2])
    expect(queue._head).toBeNull()
  })

  test('should execute tasks with same priority FIFO', async () => {
    const queue = new AsyncQueue('q-fifo', 1) as _AsyncQueue
    const executionOrder: number[] = []

    const task1 = vi.fn(async () => { await asyncPause(10); executionOrder.push(1) }) // p5
    const task2 = vi.fn(async () => { await asyncPause(10); executionOrder.push(2) }) // p0
    const task3 = vi.fn(async () => { await asyncPause(10); executionOrder.push(3) }) // p5
    const task4 = vi.fn(async () => { await asyncPause(10); executionOrder.push(4) }) // p0

    queue.add(task1, qPriority(5))
    queue.add(task2, qPriority(0))
    queue.add(task3, qPriority(5))
    queue.add(task4, qPriority(0))

    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (queue._head === null && task1.mock.calls.length > 0 && task2.mock.calls.length > 0 && task3.mock.calls.length > 0 && task4.mock.calls.length > 0) {
          clearInterval(interval)
          resolve()
        }
      }, 20)
    })

    expect(executionOrder).toEqual([1, 3, 2, 4]) // p5(task1), p5(task3), p0(task2), p0(task4)
    expect(queue._head).toBeNull()
  })

  test('should handle and log errors in tasks, then continue', async () => {
    const queue = new AsyncQueue('q-error', 1) as _AsyncQueue
    const task1ErrorMsg = 'Task 1 failed'
    const task1 = vi.fn(async () => { await asyncPause(5); throw new Error(task1ErrorMsg) })
    const task2 = vi.fn(async () => { await asyncPause(5) })

    queue.add(task1, qPriority())
    queue.add(task2, qPriority())

    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (queue._head === null && task1.mock.calls.length > 0 && task2.mock.calls.length > 0) {
          clearInterval(interval)
          resolve()
        }
      }, 20)
    })

    expect(task1).toHaveBeenCalledTimes(1)
    expect(task2).toHaveBeenCalledTimes(1) // task2 должен выполниться
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ApiRouter.AsyncQueue] key:"q-error"'),
      expect.any(Error) // или expect.objectContaining({ message: task1ErrorMsg }) если точнее
    )
    expect(queue._head).toBeNull()
  })

  test('should remove a task if abortSignal is aborted before execution', async () => {
    const queue = new AsyncQueue('q-abort', 1) as _AsyncQueue
    const controller = new AbortController()

    const taskToAbort = vi.fn(async () => { await asyncPause(10) })
    const taskToRun = vi.fn(async () => { await asyncPause(10) })

    // Добавляем задачу, которая должна выполниться, чтобы запустить очередь
    queue.add(taskToRun, qPriority(10))
    // Добавляем задачу с AbortSignal
    queue.add(taskToAbort, qPriority(5), controller.signal)

    expect(queue._head?.task).toBe(taskToRun) // taskToRun - голова
    // Здесь будет обертка над AbortSignal, а не реальная задача
    expect(queue._head?.next?.task).not.toBe(taskToAbort) // следующая

    controller.abort() // Отменяем задачу ДО того, как она могла бы начаться

    // Ждем, пока taskToRun выполнится
    await new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (queue._head === null && taskToRun.mock.calls.length > 0) { // Ждем только taskToRun
          clearInterval(interval)
          resolve()
        }
      }, 20)
    })

    expect(taskToRun).toHaveBeenCalledTimes(1)
    expect(taskToAbort).not.toHaveBeenCalled() // Отмененная задача не должна была выполниться
    expect(queue._head).toBeNull() // Очередь должна быть пуста
  })

  test('should correctly insert nodes with various priorities', () => {
    const queue = new AsyncQueue('q-insert', 1) as _AsyncQueue
    const task = () => { /**/ }

    queue.add(task, qPriority(5)) // head = {p:5}
    expect(queue._head?.priority).toBe(5)

    queue.add(task, qPriority(10)) // {p:10} -> {p:5}
    expect(queue._head?.priority).toBe(10)
    expect(queue._head?.next?.priority).toBe(5)

    queue.add(task, qPriority(0)) // {p:10} -> {p:5} -> {p:0}
    expect(queue._head?.next?.next?.priority).toBe(0)

    queue.add(task, qPriority(7)) // {p:10} -> {p:7} -> {p:5} -> {p:0}
    expect(queue._head?.next?.priority).toBe(7)
    expect(queue._head?.next?.next?.priority).toBe(5)
  })

})

describe('NamedAsyncQueue', () => {
  test('should create a new queue if key does not exist', () => {
    const namedQueue = new NamedAsyncQueue() as _NamedAsyncQueue
    const taskMock = vi.fn()

    expect(namedQueue._queues.has('new-key')).toBe(false)
    namedQueue.add('new-key', taskMock, qPriority())
    expect(namedQueue._queues.has('new-key')).toBe(true)
    expect(namedQueue._queues.get('new-key')).toBeInstanceOf(AsyncQueue)
  })

  test('should use an existing queue if key exists', () => {
    const namedQueue = new NamedAsyncQueue() as _NamedAsyncQueue
    const taskMock1 = vi.fn()
    const taskMock2 = vi.fn()

    namedQueue.add('existing-key', taskMock1, qPriority())
    const queueInstance1 = namedQueue._queues.get('existing-key')

    namedQueue.add('existing-key', taskMock2, qPriority())
    const queueInstance2 = namedQueue._queues.get('existing-key')

    expect(queueInstance1).toBe(queueInstance2) // Должна использоваться та же очередь
  })

  test('should execute tasks independently and correctly prioritized across different named queues', async () => {
    const namedQueue = new NamedAsyncQueue() as _NamedAsyncQueue
    const executionLogs: { queue: string, task: string, timestamp?: number, order?: number }[] = []
    let orderCounter = 0

    // Используем taskCompletionPromises для надежного ожидания
    const allTasksCompletionPromises: Promise<void>[] = []

    const createTask = (queueName: string, taskId: string, taskDelay: number, _priority?: number) => {
      let resolveFn: () => void
      const promise = new Promise<void>(resolve => { resolveFn = resolve })
      allTasksCompletionPromises.push(promise)

      return vi.fn(async () => {
        // const start = Date.now()
        // console.log(`[${queueName}-${taskId}] START @ ${start % 10000}`);
        await asyncPause(taskDelay)
        const end = Date.now()
        // console.log(`[${queueName}-${taskId}] END @ ${end % 10000} (took ${end - start}ms)`);
        executionLogs.push({ queue: queueName, task: taskId, timestamp: end, order: ++orderCounter })
        resolveFn()
      })
    }

    // Задачи для очереди Q1
    const taskQ1_1 = createTask('q1', 'q1_1_p0', 20)   // p0
    const taskQ1_2 = createTask('q1', 'q1_2_p10', 10)  // p10
    const taskQ1_3 = createTask('q1', 'q1_3_p5', 30)   // p5

    // Задачи для очереди Q2
    const taskQ2_1 = createTask('q2', 'q2_1_p5', 25)   // p5
    const taskQ2_2 = createTask('q2', 'q2_2_p0', 15)   // p0
    const taskQ2_3 = createTask('q2', 'q2_3_p20', 5)   // p20

    // Добавляем задачи в NamedAsyncQueue
    // Порядок добавления может влиять на то, какая задача в какой очереди запустится первой
    namedQueue.add('q1', taskQ1_1, qPriority())      // q1: taskQ1_1 (p0) - starts
    namedQueue.add('q2', taskQ2_1, qPriority(5))     // q2: taskQ2_1 (p5) - starts

    namedQueue.add('q1', taskQ1_2, qPriority(10))    // q1: taskQ1_2 (p10) - queued
    namedQueue.add('q2', taskQ2_2, qPriority())      // q2: taskQ2_2 (p0) - queued

    namedQueue.add('q1', taskQ1_3, qPriority(5))     // q1: taskQ1_3 (p5) - queued
    namedQueue.add('q2', taskQ2_3, qPriority(20))    // q2: taskQ2_3 (p20) - queued

    // Ожидаем завершения всех созданных задач
    await Promise.all(allTasksCompletionPromises)

    // Проверяем, что все задачи были вызваны
    expect(taskQ1_1).toHaveBeenCalledTimes(1)
    expect(taskQ1_2).toHaveBeenCalledTimes(1)
    expect(taskQ1_3).toHaveBeenCalledTimes(1)
    expect(taskQ2_1).toHaveBeenCalledTimes(1)
    expect(taskQ2_2).toHaveBeenCalledTimes(1)
    expect(taskQ2_3).toHaveBeenCalledTimes(1)

    // Фильтруем логи по очередям
    const orderQ1 = executionLogs.filter(log => log.queue === 'q1').map(log => log.task)
    const orderQ2 = executionLogs.filter(log => log.queue === 'q2').map(log => log.task)

    // Ожидаемый порядок выполнения ВНУТРИ каждой очереди:
    // Q1:
    // 1. taskQ1_1 (p0) - запущена первой
    // 2. taskQ1_2 (p10) - следующий по приоритету в Q1
    // 3. taskQ1_3 (p5) - следующий по приоритету в Q1
    expect(orderQ1).toEqual(['q1_1_p0', 'q1_2_p10', 'q1_3_p5'])

    // Q2:
    // 1. taskQ2_1 (p5) - запущена первой
    // 2. taskQ2_3 (p20) - следующий по приоритету в Q2
    // 3. taskQ2_2 (p0) - следующий по приоритету в Q2
    expect(orderQ2).toEqual(['q2_1_p5', 'q2_3_p20', 'q2_2_p0'])

    // Дополнительная проверка на независимость:
    // Мы не можем точно предсказать абсолютный порядок между задачами из РАЗНЫХ очередей
    // из-за асинхронности и event loop, но мы можем проверить, что очереди не блокировали друг друга.
    // Например, самая быстрая задача из q1 (taskQ1_2, 10ms) должна закончиться раньше,
    // чем самая долгая из q2, которая стартовала первой (taskQ2_1, 25ms), если они действительно независимы.
    // Это более сложная проверка, и она зависит от точности `delay`.

    // Простая проверка, что очереди пусты в конце
    expect(namedQueue._queues.get('q1')!._head).toBeNull()
    expect(namedQueue._queues.get('q2')!._head).toBeNull()

    // Проверка общего количества выполненных задач
    expect(executionLogs.length).toBe(6)
  })
})

describe('AsyncQueue Abort', () => {
  test('deleting a hung task', async () => {
    const result: any[] = []

    // Бесконечная задача
    async function endlessTask () {
      await asyncPause(10_000)
      result.push('t1')
    }
    async function task () {
      await asyncPause(100)
      result.push('t2')
    }

    const namedQueue = new AsyncQueue('queue') as _AsyncQueue

    const controller1 = new AbortController()
    const controller2 = new AbortController()
    setTimeout(() => controller1.abort(), 100)
    setTimeout(() => controller2.abort(), 1000)

    namedQueue.add(endlessTask, qPriority(), controller1.signal)
    namedQueue.add(task, qPriority(), controller2.signal)

    // Ждем более 2 сек
    await asyncPause(2_000)
    // Первая задача должна была быть удалена, после 100ms
    expect(result).toStrictEqual(['t2'])
  })
})
