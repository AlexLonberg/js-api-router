import { describe, test, expect } from 'vitest'
import { type TMiddlewareConstructor, Middleware } from '../interfaces/MiddlewareLike.js'
import { InstanceFactory } from '../interfaces/InstanceFactory.js'
import {
  // type TMiddlewareDef,
  MIDDLEWARE_REF_MARKER,
  type TMiddlewareInstanceRef,
  // type TMiddlewareIterableRef,
  // type TMiddlewareRef,
  middlewareRefFromInstance,
  middlewareRefFromConstructor,
  middlewareRefFromFactory,
  middlewareRefFromIterable,
  isMiddlewareRef,
  MiddlewareIterable,
  MiddlewareRegistry
} from './Middleware.js'

// Фейковый класс для тестирования с разными именами
function createTestMiddleware (kind: string): TMiddlewareConstructor<any, any> {
  return class extends Middleware<any, any> {
    static readonly kind = kind
    readonly kind = kind
    constructor() {
      super()
    }
  }
}

function createErrorMiddleware (kind: string, errorMessage: string): TMiddlewareConstructor<any, any> {
  return class extends Middleware<any, any> {
    static readonly kind = kind
    readonly kind = kind
    constructor() {
      super()
      throw new Error(errorMessage)
    }
  }
}

describe('MiddlewareRegistry Utilities', () => {
  describe('middlewareRefFromInstance', () => {
    test('создаёт TMiddlewareInstanceRef из инстанса', () => {
      const instance = new (createTestMiddleware('foo'))()
      const ref = middlewareRefFromInstance(instance)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref.ref).toBe(instance)
      expect(ref[MIDDLEWARE_REF_MARKER]).toBeNull()
    })
  })

  describe('middlewareRefFromConstructor', () => {
    test('создаёт TMiddlewareInstanceRef из конструктора с ленивой инициализацией', () => {
      const cls = createTestMiddleware('foo')
      const ref = middlewareRefFromConstructor(cls)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref[MIDDLEWARE_REF_MARKER]).toBeNull()
      const instance = ref.ref
      expect(instance).toBeInstanceOf(cls)
      expect(instance.kind).toBe('foo')
      // Проверяем, что повторный вызов ref возвращает тот же инстанс
      expect(ref.ref).toBe(instance)
    })
  })

  describe('middlewareRefFromFactory', () => {
    test('создаёт TMiddlewareInstanceRef из фабрики с ленивой инициализацией', () => {
      const factory = InstanceFactory.wrap('baz', () => new (createTestMiddleware('baz'))())
      const ref = middlewareRefFromFactory(factory)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref[MIDDLEWARE_REF_MARKER]).toBeNull()
      const instance = ref.ref
      expect(instance).toBeInstanceOf(createTestMiddleware('baz'))
      expect(instance.kind).toBe('baz')
      // Проверяем, что повторный вызов ref возвращает тот же инстанс
      expect(ref.ref).toBe(instance)
    })
  })

  describe('middlewareRefFromIterable', () => {
    test('создаёт TMiddlewareIterableRef из MiddlewareIterable', () => {
      const iterable = new MiddlewareIterable([
        middlewareRefFromInstance(new (createTestMiddleware('foo'))()),
        middlewareRefFromInstance(new (createTestMiddleware('bar'))()),
      ])
      const ref = middlewareRefFromIterable(iterable)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(true)
      expect(ref[MIDDLEWARE_REF_MARKER]).toBeNull()
      expect(ref.ref).toBe(iterable)
    })
  })

  describe('isMiddlewareRef', () => {
    test('возвращает true для TMiddlewareInstanceRef', () => {
      const ref = middlewareRefFromInstance(new (createTestMiddleware('foo'))())
      expect(isMiddlewareRef(ref)).toBe(true)
    })

    test('возвращает true для TMiddlewareIterableRef', () => {
      // Хотя MiddlewareIterable предназначен минимум для двух ref, пустой массив не вызывает ошибок
      const iterable = new MiddlewareIterable([] as any)
      const ref = middlewareRefFromIterable(iterable)
      expect(isMiddlewareRef(ref)).toBe(true)
    })

    test('возвращает false для других объектов', () => {
      expect(isMiddlewareRef({})).toBe(false)
      expect(isMiddlewareRef(null)).toBe(false)
      expect(isMiddlewareRef({ ref: {} })).toBe(false)
    })
  })
})

describe('MiddlewareIterable', () => {
  test('инициализирует с массивом TMiddlewareInstanceRef', () => {
    const items = [
      middlewareRefFromInstance(new (createTestMiddleware('foo'))()),
      middlewareRefFromInstance(new (createTestMiddleware('bar'))()),
    ] as const
    const iterable = new MiddlewareIterable(items)
    expect(iterable.refs).toStrictEqual(items)
  })

  test('итерируется по ref каждого middleware', () => {
    const items = [
      middlewareRefFromInstance(new (createTestMiddleware('foo'))()),
      middlewareRefFromInstance(new (createTestMiddleware('bar'))()),
    ] as const
    const iterable = new MiddlewareIterable(items)
    const result = [...iterable]
    expect(result).toStrictEqual([items[0]!.ref, items[1]!.ref])
    expect(result[0]!.kind).toBe('foo')
    expect(result[1]!.kind).toBe('bar')
  })

  test('пустой итератор возвращает пустой массив', () => {
    const iterable = new MiddlewareIterable([] as any)
    expect([...iterable]).toStrictEqual([])
  })

  test('_onlyDevelopmentVerifyInitializations не выбрасывает ошибку для корректных middleware', () => {
    const items = [
      middlewareRefFromConstructor(createTestMiddleware('foo')),
      middlewareRefFromFactory(InstanceFactory.wrap('bar', () => new (createTestMiddleware('bar'))())),
    ] as const
    const iterable = new MiddlewareIterable(items)
    expect(() => iterable._onlyDevelopmentVerifyInitializations()).not.toThrow()
  })

  test('_onlyDevelopmentVerifyInitializations выбрасывает ошибку при неудачной инициализации', () => {
    const cls = createErrorMiddleware('foo', 'Constructor failed')
    const items = [middlewareRefFromConstructor(cls)] as unknown as [TMiddlewareInstanceRef<any, any>, TMiddlewareInstanceRef<any, any>]
    const iterable = new MiddlewareIterable(items)
    expect(() => iterable._onlyDevelopmentVerifyInitializations()).toThrowError(
      /Конструктор Middleware завершился ошибкой/
    )
  })
})

describe('MiddlewareRegistry', () => {
  describe('register', () => {
    test('регистрирует инстанс MiddlewareLike', () => {
      const registry = new MiddlewareRegistry()
      const instance = new (createTestMiddleware('foo'))()
      registry.register(instance)
      expect(registry.has('foo')).toBe(true)
      expect(registry.ref('foo')?.ref).toBe(instance)
    })

    test('регистрирует конструктор Middleware', () => {
      const registry = new MiddlewareRegistry()
      const cls = createTestMiddleware('foo')
      registry.register(cls)
      expect(registry.has('foo')).toBe(true)
      const instance = registry.ref('foo')?.ref
      expect(instance).toBeInstanceOf(cls)
      expect(instance?.kind).toBe('foo')
    })

    test('регистрирует фабрику Middleware', () => {
      const registry = new MiddlewareRegistry()
      const factory = InstanceFactory.wrap('baz', () => new (createTestMiddleware('baz'))())
      registry.register(factory)
      expect(registry.has('baz')).toBe(true)
      const instance = registry.ref('baz')?.ref
      expect(instance).toBeInstanceOf(createTestMiddleware('baz'))
      expect(instance?.kind).toBe('baz')
    })

    test('выбрасывает ошибку при дублировании ключа', () => {
      const registry = new MiddlewareRegistry()
      registry.register(createTestMiddleware('foo'))
      expect(() => registry.register(createTestMiddleware('foo'))).toThrowError(
        /Middleware "foo" уже зарегистрирован/
      )
    })

    test('выбрасывает ошибку при регистрации в замороженном реестре', () => {
      const registry = new MiddlewareRegistry()
      registry.freeze()
      expect(() => registry.register(createTestMiddleware('foo'))).toThrowError(
        /MiddlewareRegistry заморожен/
      )
    })

    test('выбрасывает ошибку для некорректного kind', () => {
      const registry = new MiddlewareRegistry()
      const invalidMiddleware = { kind: '' }
      expect(() => registry.register(invalidMiddleware as any)).toThrowError(
        /Именем Middleware должна быть непустая строка/
      )
    })

    test('выбрасывает ошибку для некорректного типа middleware', () => {
      const registry = new MiddlewareRegistry()
      expect(() => registry.register({ kind: 'foo' } as any)).toThrowError(
        /Аргументом 'middleware' должен быть допустимый 'TMiddlewareConstructor\|InstanceFactory\|MiddlewareLike'/
      )
    })
  })

  describe('registerFactory', () => {
    test('регистрирует фабричную функцию', () => {
      const registry = new MiddlewareRegistry()
      const factoryFn = () => new (createTestMiddleware('baz'))()
      registry.registerFactory('baz', factoryFn)
      expect(registry.has('baz')).toBe(true)
      const instance = registry.ref('baz')?.ref
      expect(instance).toBeInstanceOf(createTestMiddleware('baz'))
      expect(instance?.kind).toBe('baz')
    })
  })

  describe('ref', () => {
    test('возвращает TMiddlewareInstanceRef для зарегистрированного middleware по строке', () => {
      const registry = new MiddlewareRegistry()
      const cls = createTestMiddleware('foo')
      registry.register(cls)
      const ref = registry.ref('foo')
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref.ref).toBeInstanceOf(cls)
      expect(ref.ref.kind).toBe('foo')
    })

    test('создаёт ленивую TMiddlewareInstanceRef для незарегистрированного ключа', () => {
      const registry = new MiddlewareRegistry()
      const ref = registry.ref('foo')
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(() => ref.ref).toThrowError(/Middleware "foo" не зарегистрирован/)
      // Регистрируем после
      registry.register(createTestMiddleware('foo'))
      expect(ref.ref).toBeInstanceOf(createTestMiddleware('foo'))
      expect(ref.ref.kind).toBe('foo')
    })

    test('возвращает TMiddlewareInstanceRef для инстанса MiddlewareLike', () => {
      const registry = new MiddlewareRegistry()
      const instance = new (createTestMiddleware('foo'))()
      const ref = registry.ref(instance)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref.ref).toBe(instance)
    })

    test('возвращает TMiddlewareInstanceRef для конструктора', () => {
      const registry = new MiddlewareRegistry()
      const cls = createTestMiddleware('foo')
      const ref = registry.ref(cls)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref.ref).toBeInstanceOf(cls)
      expect(ref.ref.kind).toBe('foo')
    })

    test('возвращает TMiddlewareInstanceRef для фабрики', () => {
      const registry = new MiddlewareRegistry()
      const factory = InstanceFactory.wrap('baz', () => new (createTestMiddleware('baz'))())
      const ref = registry.ref(factory)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(false)
      expect(ref.ref).toBeInstanceOf(createTestMiddleware('baz'))
      expect(ref.ref.kind).toBe('baz')
    })

    test('возвращает переданный TMiddlewareInstanceRef', () => {
      const registry = new MiddlewareRegistry()
      const instance = new (createTestMiddleware('foo'))()
      const ref = middlewareRefFromInstance(instance)
      expect(registry.ref(ref)).toBe(ref)
    })

    test('выбрасывает ошибку для некорректного типа', () => {
      const registry = new MiddlewareRegistry()
      expect(() => registry.ref({ kind: 'foo' } as any)).toThrowError(
        /Аргументом 'middleware' должен быть допустимый тип/
      )
    })
  })

  describe('iter', () => {
    test('создаёт TMiddlewareIterableRef из массива middleware', () => {
      const registry = new MiddlewareRegistry()
      const items = [
        'foo',
        new (createTestMiddleware('bar'))(),
        createTestMiddleware('baz'),
        InstanceFactory.wrap('qux', () => new (createTestMiddleware('qux'))()),
      ]
      registry.register(createTestMiddleware('foo'))
      const ref = registry.iter(items)
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(true)
      const iterable = ref.ref
      expect(iterable).toBeInstanceOf(MiddlewareIterable)
      const result = [...iterable]
      expect(result.length).toBe(4)
      expect(result[0]!.kind).toBe('foo')
      expect(result[1]!.kind).toBe('bar')
      expect(result[2]!.kind).toBe('baz')
      expect(result[3]!.kind).toBe('qux')
    })

    test('обрабатывает пустой массив', () => {
      const registry = new MiddlewareRegistry()
      const ref = registry.iter([])
      expect(isMiddlewareRef(ref)).toBe(true)
      expect(ref.iterable).toBe(true)
      expect([...ref.ref]).toStrictEqual([])
    })

    test('поддерживает ленивую инициализацию незарегистрированных middleware', () => {
      const registry = new MiddlewareRegistry()
      const ref = registry.iter(['foo', 'bar'])
      expect(() => [...ref.ref]).toThrowError(/Middleware "foo" не зарегистрирован/)
      registry.register(createTestMiddleware('foo'))
      registry.register(createTestMiddleware('bar'))
      const result = [...ref.ref]
      expect(result.length).toBe(2)
      expect(result[0]!.kind).toBe('foo')
      expect(result[1]!.kind).toBe('bar')
    })
  })

  describe('_onlyDevelopmentVerifyInitializations', () => {
    test('не выбрасывает ошибку для корректных middleware', () => {
      const registry = new MiddlewareRegistry()
      registry.register(createTestMiddleware('foo'))
      registry.register(InstanceFactory.wrap('bar', () => new (createTestMiddleware('bar'))()))
      expect(() => registry._onlyDevelopmentVerifyInitializations()).not.toThrow()
    })

    test('выбрасывает ошибку для незарегистрированного middleware', () => {
      const registry = new MiddlewareRegistry()
      registry.ref('foo') // Ленивая регистрация
      expect(() => registry._onlyDevelopmentVerifyInitializations()).toThrowError(
        /Middleware "foo" не зарегистрирован/
      )
    })

    test('выбрасывает ошибку при несовпадении kind', () => {
      const registry = new MiddlewareRegistry()
      const cls = createTestMiddleware('bar')
      registry.registerFactory('foo', () => new cls())
      expect(() => registry._onlyDevelopmentVerifyInitializations()).toThrowError(
        /Имя зарегистрированного Middleware "foo" не совпадает с именем экземпляра класса "bar"/
      )
    })

    test('выбрасывает ошибку при неудачной инициализации', () => {
      const registry = new MiddlewareRegistry()
      const cls = createErrorMiddleware('foo', 'Constructor failed')
      registry.register(cls)
      expect(() => registry._onlyDevelopmentVerifyInitializations()).toThrowError(
        /Конструктор Middleware "foo" завершился ошибкой/
      )
    })
  })
})
