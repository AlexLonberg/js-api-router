import { isFunction, isNonemptyString, isObject, safeToJson } from '../utils.js'
import { errorDetails, ConfigureError } from '../errors.js'
import { InstanceFactory } from '../interfaces/InstanceFactory.js'
import { MiddlewareLike, type TMiddlewareConstructor } from '../interfaces/MiddlewareLike.js'
import { RegistryBase } from '../libs/RegistryBase.js'
import type { TNonemptyString } from '../types.js'

/**
 * Допустимый тип `Middleware`: конструктор, фабрика или инстанс.
 */
type TMiddlewareDef<TIn, TOut> = TMiddlewareConstructor<TIn, TOut> | InstanceFactory<MiddlewareLike<TIn, TOut>> | MiddlewareLike<TIn, TOut>

const MIDDLEWARE_REF_MARKER = Symbol('MIDDLEWARE_REF_MARKER')

/**
 * Ленивая ссылка на инстанс {@link MiddlewareLike}.
 */
type TMiddlewareInstanceRef<TIn, TOut> = {
  readonly [MIDDLEWARE_REF_MARKER]: null
  readonly iterable: false
  readonly ref: MiddlewareLike<TIn, TOut>
}

/**
 * Ленивая ссылка на итерируемый {@link MiddlewareIterable}.
 */
type TMiddlewareIterableRef<TIn, TOut> = {
  readonly [MIDDLEWARE_REF_MARKER]: null
  readonly iterable: true
  readonly ref: MiddlewareIterable<TIn, TOut>
}

/**
 * Ленивая ссылка на инстанс {@link MiddlewareLike} или итерируемый {@link MiddlewareIterable}.
 */
type TMiddlewareRef<TIn, TOut> = TMiddlewareInstanceRef<TIn, TOut> | TMiddlewareIterableRef<TIn, TOut>

function _defineMarker<T extends object> (wrapper: T, iterable: boolean): T {
  return Object.defineProperties(wrapper, {
    [MIDDLEWARE_REF_MARKER]: {
      enumerable: true,
      value: null
    },
    iterable: {
      enumerable: true,
      value: iterable
    }
  })
}

function middlewareRefFromInstance (instace: MiddlewareLike<any, any>): TMiddlewareInstanceRef<any, any> {
  const wrapper = Object.defineProperty({}, 'ref', {
    enumerable: true,
    value: instace
  })
  return _defineMarker(wrapper, false) as TMiddlewareInstanceRef<any, any>
}

function middlewareRefFromConstructor (cls: TMiddlewareConstructor<any, any>): TMiddlewareInstanceRef<any, any> {
  const wrapper = {
    get ref (): MiddlewareLike<any, any> {
      const ins = new cls()
      Object.defineProperty(wrapper, 'ref', {
        enumerable: true,
        value: ins
      })
      return ins
    }
  }
  return _defineMarker(wrapper, false) as TMiddlewareInstanceRef<any, any>
}

function middlewareRefFromFactory (factory: InstanceFactory<MiddlewareLike<any, any>>): TMiddlewareInstanceRef<any, any> {
  const wrapper = {
    get ref (): MiddlewareLike<any, any> {
      const ins = factory.create()
      Object.defineProperty(wrapper, 'ref', {
        enumerable: true,
        value: ins
      })
      return ins
    }
  }
  return _defineMarker(wrapper, false) as TMiddlewareInstanceRef<any, any>
}

function middlewareRefFromIterable (iter: MiddlewareIterable<any, any>): TMiddlewareIterableRef<any, any> {
  const wrapper = Object.defineProperty({}, 'ref', {
    enumerable: true,
    value: iter
  })
  return _defineMarker(wrapper, true) as TMiddlewareIterableRef<any, any>
}

function isMiddlewareRef (value: any): value is TMiddlewareRef<any, any> {
  return isObject(value) && (MIDDLEWARE_REF_MARKER in value)
}

/**
 * Итерируемая обертка с массивом ленивых ссылок {@link TMiddlewareInstanceRef}.
 */
class MiddlewareIterable<TIn, TOut> implements Iterable<MiddlewareLike<any, any>, void, undefined> {
  protected readonly _items: readonly TMiddlewareInstanceRef<any, any>[] = []

  constructor(items: readonly [TMiddlewareInstanceRef<TIn, any>, ...(TMiddlewareInstanceRef<any, any>[]), TMiddlewareInstanceRef<any, TOut>]) {
    this._items = Object.freeze([...items])
  }

  /**
   * Это свойство не должно использоваться и возвращает `null`.
   */
  get kind (): '' { return null as unknown as '' }

  get refs (): TMiddlewareInstanceRef<any, any>[] {
    return [...this._items]
  }

  *[Symbol.iterator] (): Iterator<MiddlewareLike<any, any>, void, undefined> {
    for (const item of this._items) {
      yield item.ref
    }
  }

  /**
   * Этот метод может быть полезен для проверки инициализации ленивых ссылок. Последовательно инициализирует внутренние
   * элементы массива, вызывая атрибут `ref`, и поднимает исключение, если конструктор завершился ошибкой.
   */
  _onlyDevelopmentVerifyInitializations (): void {
    for (const wrapper of this._items) {
      try {
        wrapper.ref
      } catch (e) {
        if ((e instanceof ConfigureError) && (e.detail.message ?? '').includes('не зарегистрирован')) {
          throw e
        }
        throw new ConfigureError(errorDetails.ConfigureError('Конструктор Middleware завершился ошибкой.', e))
      }
    }
  }
}

/**
 * Реестр {@link MiddlewareLike}.
 */
class MiddlewareRegistry extends RegistryBase<string, TMiddlewareInstanceRef<any, any>> {
  protected readonly _lazyRefs = new Map<string, TMiddlewareInstanceRef<any, any>>()

  /**
   * Зарегистрировать конструктор или тип {@link MiddlewareLike}.
   *
   * @param middleware Инстанс, конструктор или фабрика.
   */
  register (middleware: TMiddlewareDef<any, any>): void {
    if (this._frozen) {
      throw new ConfigureError(errorDetails.ConfigureError(`MiddlewareRegistry заморожен и не может зарегистрировать новый тип Middleware ${safeToJson(middleware.kind)}.`))
    }
    if (!isNonemptyString(middleware.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Именем Middleware должна быть непустая строка, получено: ${safeToJson(middleware.kind)}.`))
    }
    if (this._items.has(middleware.kind)) {
      throw new ConfigureError(errorDetails.ConfigureError(`Middleware "${middleware.kind}" уже зарегистрирован.`))
    }
    if (middleware instanceof MiddlewareLike) {
      this._items.set(middleware.kind, middlewareRefFromInstance(middleware))
    }
    else if (middleware instanceof InstanceFactory) {
      this._items.set(middleware.kind, middlewareRefFromFactory(middleware))
    }
    else if (isFunction<TMiddlewareConstructor<any, any>>(middleware)) {
      this._items.set(middleware.kind, middlewareRefFromConstructor(middleware))
    }
    else {
      throw new ConfigureError(errorDetails.ConfigureError(`Аргументом 'middleware' должен быть допустимый 'TMiddlewareConstructor|InstanceFactory|MiddlewareLike', получено: ${safeToJson(middleware)}`))
    }
  }

  /**
   * Зарегистрировать фабричную функцию создания {@link MiddlewareLike}.
   *
   * @param key Уникальный ключ `Middleware`.
   * @param fn  Функция возвращающая класс с ключом `key`. Пользовательские функции обязаны правильно определять ключи
   *            на экземплярах, иначе операции с инстансом могут завершится ошибкой.
   */
  registerFactory (key: string, fn: (() => MiddlewareLike<any, any>)): void {
    this.register(InstanceFactory.wrap(key, fn))
  }

  protected _createLazyRef (key: TNonemptyString): TMiddlewareInstanceRef<any, any> {
    const items = this._items
    let wrapper = items.get(key)
    if (wrapper) {
      return wrapper
    }
    const lazyRefs = this._lazyRefs
    wrapper = lazyRefs.get(key)
    if (wrapper) {
      return wrapper
    }
    wrapper = {
      get ref () {
        const lazyRef = items.get(key)
        if (!lazyRef) {
          throw new ConfigureError(errorDetails.ConfigureError(`Middleware ${safeToJson(key)} не зарегистрирован.`))
        }
        Object.defineProperty(wrapper, 'ref', {
          enumerable: true,
          value: lazyRef.ref
        })
        lazyRefs.delete(key)
        return lazyRef.ref
      }
    } as TMiddlewareInstanceRef<any, any>
    _defineMarker(wrapper, false)
    lazyRefs.set(key, wrapper)
    return wrapper
  }

  /**
   * Оборачивает аргумент в {@link TMiddlewareRef} для _"ленивого"_ получения инстанса {@link MiddlewareLike}.
   *
   * @param middleware   Один из поддерживаемых вариантов: строка, экземпляр, конструктор или фабрика. Именованный
   *                     `Middleware` необязательно должен быть зарегистрирован в момент получения ссылки.
   */
  ref (middleware: (string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any>)): TMiddlewareInstanceRef<any, any> {
    if (isMiddlewareRef(middleware) && !middleware.iterable) {
      return middleware
    }
    if (isNonemptyString(middleware)) {
      return this._createLazyRef(middleware)
    }
    if (middleware instanceof MiddlewareLike) {
      return middlewareRefFromInstance(middleware)
    }
    if (middleware instanceof InstanceFactory) {
      return middlewareRefFromFactory(middleware)
    }
    if (isFunction<TMiddlewareConstructor<any, any>>(middleware)) {
      return middlewareRefFromConstructor(middleware)
    }
    throw new ConfigureError(errorDetails.ConfigureError(`Аргументом 'middleware' должен быть допустимый тип 'string|TMiddlewareConstructor|InstanceFactory|MiddlewareLike|TMiddlewareInstanceRef', получено: ${safeToJson(middleware)}.`))
  }

  /**
   * Оборачивает набор допустимых `Middleware` в итерируемый {@link MiddlewareIterable}.
   *
   * @param middlewares Массив допустимых определений или строка с именем `Middleware.kind`. Именованный `Middleware`
   *                    необязательно должен быть зарегистрирован в момент получения итератора.
   */
  iter (middlewares: readonly (string | TMiddlewareDef<any, any> | TMiddlewareInstanceRef<any, any>)[]): TMiddlewareIterableRef<any, any> {
    const items = middlewares.map((item) => this.ref(item)) as [TMiddlewareInstanceRef<any, any>, TMiddlewareInstanceRef<any, any>] // fix
    return middlewareRefFromIterable(new MiddlewareIterable(items))
  }

  /**
   * Этот метод может быть полезен для проверки инициализации классов и соответствия зарегистрированным ключам.
   *
   * Функция последовательно вызывает конструкторы или фабрики и проверяет соответствие ключа регистрации и ключа
   * инстанса. Ошибки инициализации или несоответствие ключей поднимают исключение {@link ConfigureError}.
   */
  _onlyDevelopmentVerifyInitializations (): void {
    for (const [key, wrapper] of [...this._items, ...this._lazyRefs]) {
      let ins: MiddlewareLike<any, any>
      try {
        ins = wrapper.ref
      } catch (e) {
        if ((e instanceof ConfigureError) && (e.detail.message ?? '').includes('не зарегистрирован')) {
          throw e
        }
        throw new ConfigureError(errorDetails.ConfigureError(`Конструктор Middleware "${key}" завершился ошибкой.`, e))
      }
      if (key !== ins.kind) {
        throw new ConfigureError(errorDetails.ConfigureError(`Имя зарегистрированного Middleware "${key}" не совпадает с именем экземпляра класса ${safeToJson(ins.kind)}.`))
      }
    }
  }
}

export {
  type TMiddlewareDef,
  MIDDLEWARE_REF_MARKER,
  type TMiddlewareInstanceRef,
  type TMiddlewareIterableRef,
  type TMiddlewareRef,
  middlewareRefFromInstance,
  middlewareRefFromConstructor,
  middlewareRefFromFactory,
  middlewareRefFromIterable,
  isMiddlewareRef,
  MiddlewareIterable,
  MiddlewareRegistry
}
