import { describe, test, expect, vi } from 'vitest'
import {
  // type IPathComponentsBase,
  // type IPathComponentsPath,
  // type IPathComponentsParams,
  type TParsedPathComponents,
  parsePathComponents,
  parsedPathComponentsToString,
  PathComponents,
  // MutablePathComponents,
  MutablePath,
  MutablePathTemplate
} from './PathComponents.js'

describe('PathComponents Utilities', () => {
  describe('parsePathComponents', () => {
    test('обрабатывает простой путь без параметров', () => {
      const result = parsePathComponents('/path/to/resource/', false)
      expect(result).toStrictEqual({
        hasStartSlash: true,
        hasEndSlash: true,
        path: 'path/to/resource',
        components: null,
        name2Index: null,
      })
    })

    test('обрабатывает путь с параметрами', () => {
      const result = parsePathComponents('/user/{id}/profile/{section}/', true)
      expect(result).toStrictEqual({
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      })
    })

    test('обрабатывает пустой путь', () => {
      const result = parsePathComponents(null, false)
      expect(result).toStrictEqual({
        hasStartSlash: false,
        hasEndSlash: false,
        path: null,
        components: null,
        name2Index: null,
      })
    })

    test('обрабатывает путь только со слешами', () => {
      const result = parsePathComponents('///', false)
      expect(result).toStrictEqual({
        hasStartSlash: true,
        hasEndSlash: false,
        path: null,
        components: null,
        name2Index: null,
      })
    })

    test('выбрасывает ошибку при дублировании имени параметра', () => {
      expect(() => parsePathComponents('/{id}/path/{id}', true)).toThrowError(/Повтор имени переменной "id"/)
    })

    test('игнорирует параметры, если usePlaceholder=false', () => {
      const result = parsePathComponents('/user/{id}/profile', false)
      expect(result).toStrictEqual({
        hasStartSlash: true,
        hasEndSlash: false,
        path: 'user/{id}/profile',
        components: null,
        name2Index: null,
      })
    })
  })

  describe('parsedPathComponentsToString', () => {
    test('преобразует простой путь', () => {
      const input: TParsedPathComponents = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: 'path/to/resource',
        components: null,
        name2Index: null,
      }
      expect(parsedPathComponentsToString(input)).toBe('/path/to/resource/')
    })

    test('преобразует путь с параметрами', () => {
      const input: TParsedPathComponents = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      }
      expect(parsedPathComponentsToString(input)).toBe('/user/{id}/profile/{section}/')
    })

    test('обрабатывает пустой путь', () => {
      const input: TParsedPathComponents = {
        hasStartSlash: false,
        hasEndSlash: false,
        path: null,
        components: null,
        name2Index: null,
      }
      expect(parsedPathComponentsToString(input)).toBe('')
    })

    test('обрабатывает путь только со слешем', () => {
      const input: TParsedPathComponents = {
        hasStartSlash: true,
        hasEndSlash: false,
        path: null,
        components: null,
        name2Index: null,
      }
      expect(parsedPathComponentsToString(input)).toBe('/')
    })
  })

  describe('PathComponents', () => {
    test('инициализирует простой путь', () => {
      const path = new PathComponents('/path/to/resource/', false)
      expect(path.hasStartSlash).toBe(true)
      expect(path.hasEndSlash).toBe(true)
      expect(path.path).toBe('path/to/resource')
      expect(path.components).toBeNull()
      expect(path.name2Index).toBeNull()
      expect(path.isEmpty()).toBe(false)
      expect(path.isTotalEmpty()).toBe(false)
    })

    test('инициализирует путь с параметрами', () => {
      const path = new PathComponents('/user/{id}/profile/{section}/', true)
      expect(path.hasStartSlash).toBe(true)
      expect(path.hasEndSlash).toBe(true)
      expect(path.path).toBeNull()
      expect(path.components).toStrictEqual(['user', 'id', 'profile', 'section'])
      expect(path.name2Index).toStrictEqual(new Map([['id', 1], ['section', 3]]))
      expect(path.isEmpty()).toBe(false)
      expect(path.isTotalEmpty()).toBe(false)
    })

    test('инициализирует пустой путь', () => {
      const path = new PathComponents(null, false)
      expect(path.hasStartSlash).toBe(false)
      expect(path.hasEndSlash).toBe(false)
      expect(path.path).toBeNull()
      expect(path.components).toBeNull()
      expect(path.name2Index).toBeNull()
      expect(path.isEmpty()).toBe(true)
      expect(path.isTotalEmpty()).toBe(true)
    })

    test('инициализирует путь только со слешем', () => {
      const path = new PathComponents('/', false)
      expect(path.hasStartSlash).toBe(true)
      expect(path.hasEndSlash).toBe(false)
      expect(path.path).toBeNull()
      expect(path.components).toBeNull()
      expect(path.name2Index).toBeNull()
      expect(path.isEmpty()).toBe(true)
      expect(path.isTotalEmpty()).toBe(false)
    })

    describe('extends', () => {
      test('сливает два простых пути', () => {
        const path1 = new PathComponents('/path1/', false)
        const path2 = new PathComponents('/path2/', false)
        const result = path1.extends(path2)
        expect(result.path).toBe('path1/path2')
        expect(result.hasStartSlash).toBe(true)
        expect(result.hasEndSlash).toBe(true)
        expect(result.components).toBeNull()
        expect(result.name2Index).toBeNull()
      })

      test('сливает путь с параметрами и простой путь', () => {
        const path1 = new PathComponents('/user/{id}/', true)
        const path2 = new PathComponents('/profile/', false)
        const result = path1.extends(path2)
        expect(result.path).toBeNull()
        expect(result.components).toStrictEqual(['user', 'id', 'profile'])
        expect(result.name2Index).toStrictEqual(new Map([['id', 1]]))
        expect(result.hasStartSlash).toBe(true)
        expect(result.hasEndSlash).toBe(true)
      })

      test('сливает простой путь и путь с параметрами', () => {
        const path1 = new PathComponents('/user/', false)
        const path2 = new PathComponents('/{id}/profile/', true)
        const result = path1.extends(path2)
        expect(result.path).toBeNull()
        expect(result.components).toStrictEqual(['user', 'id', 'profile'])
        expect(result.name2Index).toStrictEqual(new Map([['id', 1]]))
        expect(result.hasStartSlash).toBe(true)
        expect(result.hasEndSlash).toBe(true)
      })

      test('сливает два пути с параметрами', () => {
        const path1 = new PathComponents('/user/{id}/', true)
        const path2 = new PathComponents('/profile/{section}/', true)
        const result = path1.extends(path2)
        expect(result.path).toBeNull()
        expect(result.components).toStrictEqual(['user', 'id', 'profile', 'section'])
        expect(result.name2Index).toStrictEqual(new Map([['id', 1], ['section', 3]]))
        expect(result.hasStartSlash).toBe(true)
        expect(result.hasEndSlash).toBe(true)
      })

      test('возвращает this для null/undefined', () => {
        const path = new PathComponents('/path/', false)
        expect(path.extends(null)).toBe(path)
        expect(path.extends(undefined)).toBe(path)
      })

      test('возвращает this для totalEmpty второго пути', () => {
        const path1 = new PathComponents('/path/', false)
        const path2 = new PathComponents(null, false)
        expect(path1.extends(path2)).toBe(path1)
      })

      test('возвращает второй путь для totalEmpty первого пути', () => {
        const path1 = new PathComponents(null, false)
        const path2 = new PathComponents('/path/', false)
        expect(path1.extends(path2)).toBe(path2)
      })

      test('выбрасывает ошибку при дублировании имени параметра', () => {
        const path1 = new PathComponents('/user/{id}/', true)
        const path2 = new PathComponents('/profile/{id}/', true)
        expect(() => path1.extends(path2)).toThrowError(/Повтор имени переменной "id"/)
      })
    })

    describe('toMutable', () => {
      test('возвращает MutablePath для простого пути', () => {
        const path = new PathComponents('/path/to/resource/', false)
        const mutable = path.toMutable()
        expect(mutable).toBeInstanceOf(MutablePath)
        expect(mutable.toString()).toBe('path/to/resource')
      })

      test('возвращает MutablePathTemplate для пути с параметрами', () => {
        const path = new PathComponents('/user/{id}/', true)
        const mutable = path.toMutable()
        expect(mutable).toBeInstanceOf(MutablePathTemplate)
        // Если не подставить значения, мы не получим ошибку, а путь займет имя переменной
        expect(mutable.toString()).toBe('user/id')
        // Ошибку можно вызвать только для типа MutablePathTemplate
        expect(() => mutable.filledOrThrow()).toThrowError(/Не установлены все параметры '\[id\]' пути: "user\/\{id\}"./)
        mutable.use({ id: 123 })
        expect(mutable.toString()).toBe('user/123')
        mutable.useEntries([['id', 'uuid456']])
        expect(mutable.toString()).toBe('user/uuid456')
      })
    })
  })

  describe('MutablePath', () => {
    test('инициализирует с простым путём', () => {
      const cfg = { hasStartSlash: true, hasEndSlash: true, path: 'path/to/resource', components: null, name2Index: null }
      const path = new MutablePath(cfg)
      expect(path.hasStartSlash).toBe(true)
      expect(path.hasEndSlash).toBe(true)
      expect(path.isEmpty()).toBe(false)
      expect(path.toString()).toBe('path/to/resource')
    })

    test('игнорирует вызов use и useEntries', () => {
      const cfg = { hasStartSlash: true, hasEndSlash: true, path: 'path/to/resource', components: null, name2Index: null }
      const path = new MutablePath(cfg)
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {/**/ })
      path.use({ id: '123' })
      path.useEntries([['id', '123']])
      expect(consoleWarnSpy).toHaveBeenCalledWith('[MutablePath] Попытка установить переменные пути для маршрута который их не имеет.')
      expect(path.toString()).toBe('path/to/resource')
      consoleWarnSpy.mockRestore()
    })
  })

  describe('MutablePathTemplate', () => {
    test('инициализирует с путём с параметрами', () => {
      const cfg = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      }
      const path = new MutablePathTemplate(cfg)
      expect(path.hasStartSlash).toBe(true)
      expect(path.hasEndSlash).toBe(true)
      expect(path.isEmpty()).toBe(false)
      expect(path.toString()).toBe('user/id/profile/section')
    })

    test('use заменяет параметры', () => {
      const cfg = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      }
      const path = new MutablePathTemplate(cfg)
      path.use({ id: '123', section: 'settings' })
      expect(path.toString()).toBe('user/123/profile/settings')
    })

    test('useEntries заменяет параметры', () => {
      const cfg = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      }
      const path = new MutablePathTemplate(cfg)
      path.useEntries([['id', '123'], ['section', 'settings']])
      expect(path.toString()).toBe('user/123/profile/settings')
    })

    test('игнорирует неизвестные параметры', () => {
      const cfg = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id']),
        name2Index: Object.freeze(new Map([['id', 1]])),
      }
      const path = new MutablePathTemplate(cfg)
      path.use({ id: '123', unknown: '456' })
      expect(path.toString()).toBe('user/123')
    })

    test('filledOrThrow выбрасывает ошибку, если не все параметры установлены', () => {
      const cfg = {
        hasStartSlash: true,
        hasEndSlash: true,
        path: null,
        components: Object.freeze(['user', 'id', 'profile', 'section']),
        name2Index: Object.freeze(new Map([['id', 1], ['section', 3]])),
      }
      const path = new MutablePathTemplate(cfg)
      path.use({ id: '123' })
      expect(() => path.filledOrThrow()).toThrowError(/Не установлены все параметры/)
      path.use({ section: 'settings' })
      expect(() => path.filledOrThrow()).not.toThrow()
    })
  })
})
