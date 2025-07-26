import type { UOptional, URecordToEntries } from '../types.js'
import { errorDetails, ConfigureError, ProtocolError } from '../errors.js'
import { isNonemptyString, freezeMap, safeToJson } from '../utils.js'

interface IPathComponentsBase {
  readonly hasStartSlash: boolean
  readonly hasEndSlash: boolean
}

/**
 * Для путей не имеющих шаблонных компонентов
 */
interface IPathComponentsPath extends IPathComponentsBase {
  readonly path: null | string
}

/**
 * Для путей имеющих шаблонные строки с заполнителями
 */
interface IPathComponentsParams extends IPathComponentsBase {
  readonly components: readonly string[]
  readonly name2Index: ReadonlyMap<string, number>
}

type TParsedPathComponents = {
  hasStartSlash: boolean
  hasEndSlash: boolean
  path: null | string
  components: null | readonly string[]
  name2Index: null | ReadonlyMap<string, number>
}

const _startSlash = /^\/+/
const _endSlash = /\/+$/
const _slashes = /\/+/g
const _onlySlashes = /^\/+$/
const _startAndEndSlashes = /^\/+|\/+$/g
const _hasBracketPathParam = /^\{.+\}$/
const _rmBracketPathParam = /^\{|\}$/g
const re = Object.freeze({
  get startSlash () {
    _startSlash.lastIndex = 0
    return _startSlash
  },
  get endSlash () {
    _endSlash.lastIndex = 0
    return _endSlash
  },
  get slashes () {
    _slashes.lastIndex = 0
    return _slashes
  },
  get onlySlashes () {
    _onlySlashes.lastIndex = 0
    return _onlySlashes
  },
  get startAndEndSlashes () {
    _startAndEndSlashes.lastIndex = 0
    return _startAndEndSlashes
  },
  get hasBracketPathParam () {
    _hasBracketPathParam.lastIndex = 0
    return _hasBracketPathParam
  },
  get rmBracketPathParam () {
    _rmBracketPathParam.lastIndex = 0
    return _rmBracketPathParam
  }
} as const)

/**
 * Разбирает строку пути.
 *
 * Строка может иметь заполнители вида `/{id}/`. Формат заполнителя должен иметь фигурные скобки.
 * Важно: в пути не допускается повтор имен переменных `{id}/path/{id}` и аргумент `usePlaceholder` должен быть установлен в `true`.
 *
 * @param path Путь с заполнителями или нет.
 * @param usePlaceholder Игнорировать заполнителя и считать сегменты пути обычной строкой.
 */
function parsePathComponents (path: undefined | null | string, usePlaceholder: undefined | null | boolean): TParsedPathComponents {
  const result: TParsedPathComponents = {
    hasStartSlash: false,
    hasEndSlash: false,
    path: null,
    components: null,
    name2Index: null // ReadonlyMap<string, number>
  }
  if (!isNonemptyString(path)) {
    return result
  }
  if (re.onlySlashes.test(path)) {
    result.hasStartSlash = true
    return result
  }
  result.hasStartSlash = re.startSlash.test(path)
  result.hasEndSlash = re.endSlash.test(path)
  // Пустая строка возвратит один элемент с пустой строкой ''.split(/\/+/g) -> [''] - фильтруем, хотя выше мы должны выйти
  const segments = path.replace(re.startAndEndSlashes, '').split(re.slashes)
  if (segments.length === 1 && segments[0] === '') {
    segments.splice(0)
  }
  const components: string[] = []
  const name2Index = new Map<string, number>()
  let lastItem: 0 | 1 | 2 = 0
  let hasParams = false
  for (let i = 0; i < segments.length; ++i) {
    const value = segments[i]!
    if (usePlaceholder && re.hasBracketPathParam.test(value)) {
      hasParams = true
      const name = value.replace(re.rmBracketPathParam, '')
      if (name2Index.has(name)) {
        throw new ConfigureError(errorDetails.ConfigureError(`Повтор имени переменной ${safeToJson(name)} в пути ${safeToJson(path)}`))
      }
      name2Index.set(name, components.length)
      components.push(name)
      lastItem = 2
    }
    else if (lastItem === 1) {
      const lastIndex = components.length - 1
      const before = components[lastIndex]!
      components[lastIndex] = `${before}/${value}`
    }
    else {
      components.push(value)
      lastItem = 1
    }
  }
  if (hasParams) {
    result.components = Object.freeze(components)
    result.name2Index = freezeMap(name2Index)
  }
  else if (components.length > 0) {
    result.path = components.join('/')
  }
  else {
    // Если после split() была пустая строка, то мы окажемся здесь(но вряд ли)
    // Явно проверяем и установим только один слеш
    result.hasStartSlash = result.hasStartSlash || result.hasEndSlash
    result.hasEndSlash = false
  }
  return result
}

/**
 * Преобразует компоненты пути полученные {@link parsePathComponents} обратно к строке пути.
 *
 * @param parsed Объект опций.
 */
function parsedPathComponentsToString (path: TParsedPathComponents): string {
  const startSlash = path.hasStartSlash ? '/' : ''
  let endSlash = path.hasEndSlash ? '/' : ''
  let joined: string
  if (path.components) {
    const segments = [...path.components]
    for (const [key, index] of path.name2Index!) {
      segments[index] = `{${key}}`
    }
    joined = segments.join('/')
  }
  else if (path.path) {
    joined = path.path
  }
  else {
    joined = ''
    endSlash = ''
  }
  return `${startSlash}${joined}${endSlash}`
}

const _EXTENDS_MARKER = Symbol()

/**
 * Неизменяемая конфигурация пути маршрута.
 */
class PathComponents<T extends Record<string, string | number> = Record<string, string | number>> implements IPathComponentsBase {
  protected readonly _hasStartSlash: boolean
  protected readonly _hasEndSlash: boolean
  protected readonly _components: null | readonly string[]
  protected readonly _name2Index: null | ReadonlyMap<string, number>
  protected readonly _path: null | string
  protected readonly _isEmpty: boolean

  constructor(pathOrTemplate: null | string, usePlaceholder: boolean) {
    if (pathOrTemplate === _EXTENDS_MARKER as any) {
      this._hasStartSlash = (usePlaceholder as unknown as TParsedPathComponents).hasStartSlash
      this._hasEndSlash = (usePlaceholder as unknown as TParsedPathComponents).hasEndSlash
      this._components = (usePlaceholder as unknown as TParsedPathComponents).components
      this._name2Index = (usePlaceholder as unknown as TParsedPathComponents).name2Index
      this._path = (usePlaceholder as unknown as TParsedPathComponents).path
    }
    else {
      const components = parsePathComponents(pathOrTemplate, usePlaceholder)
      this._hasStartSlash = components.hasStartSlash
      this._hasEndSlash = components.hasEndSlash
      this._components = components.components
      this._name2Index = components.name2Index
      this._path = components.path
    }
    this._isEmpty = !this._components && !this._path
  }

  /**
   * У пути нет ни одного сегмента.
   *
   * Это не означает что путь не имеет слеша, который не учитывается сегментами.
   * Для проверки слеша следует использовать {@link hasStartSlash}.
   */
  isEmpty (): boolean {
    return this._isEmpty
  }

  /**
   * Тотальная пустота означает что у пути нет ни одного сегмента и крайних слешей {@link hasStartSlash} + {@link hasEndSlash}.
   */
  isTotalEmpty (): boolean {
    // Последний слеш не проверяется при пустом пути - он гарантировано будет false,
    // функция парсера не установит второй слеш при таком пути '/'
    return this._isEmpty && !this._hasStartSlash
  }

  /**
   * Есть ли у пути первый слеш.
   */
  get hasStartSlash (): boolean {
    return this._hasStartSlash
  }

  /**
   * Есть ли у пути последний слеш.
   *
   * Если {@link isEmpty()} равен `true`, здесь гарантировано будет `false`. Слеш у пустого пути может быть только один - {@link hasStartSlash}.
   */
  get hasEndSlash (): boolean {
    return this._hasEndSlash
  }

  get components (): null | readonly string[] {
    return this._components
  }

  /**
   * Если поле {@link components} непустое, здесь гарантировано будет `ReadonlyMap<string, number>`.
   */
  get name2Index (): null | ReadonlyMap<string, number> {
    return this._name2Index
  }

  get path (): null | string {
    return this._path
  }

  getParsedPathComponents (): TParsedPathComponents {
    return {
      hasStartSlash: this._hasStartSlash,
      hasEndSlash: this._hasEndSlash,
      components: this._components,
      name2Index: this._name2Index,
      path: this._path
    }
  }

  extends<E extends Record<string, string | number> = T> (pathOrTemplate: undefined | null | string | PathComponents<E>): PathComponents<T & E> {
    if (!pathOrTemplate) {
      return this as PathComponents<T & E>
    }
    const isInstance = pathOrTemplate instanceof PathComponents
    // Если второй или первый полностью пустой.
    if (isInstance && pathOrTemplate.isTotalEmpty()) {
      return this as PathComponents<T & E>
    }
    if (isInstance && this.isTotalEmpty()) {
      return pathOrTemplate as PathComponents<T & E>
    }
    const { hasStartSlash: newHasStartSlash, hasEndSlash: newHasEndSlash, components: newComponents, name2Index: newName2Index, path: newPath } = isInstance ? pathOrTemplate.getParsedPathComponents() : parsePathComponents(pathOrTemplate, false)
    const { hasStartSlash, hasEndSlash, components, name2Index, path } = this.getParsedPathComponents()
    // 1. Оба пути строки
    if (path && newPath) {
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash, hasEndSlash: newHasEndSlash, components: null, name2Index: null, path: `${path}/${newPath}` })
    }
    // 2. Оба компоненты пути
    if (components && newComponents) {
      const combined = [...components]
      const n2i = new Map(name2Index!)
      for (let i = 0; i < newComponents.length; ++i) {
        const segment = newComponents[i]!
        // Обязательно проверяем - сегмент может иметь такое же имя как переменная
        if (newName2Index!.get(segment) === i) {
          if (n2i.has(segment)) {
            throw new ConfigureError(errorDetails.ConfigureError(`Повтор имени переменной "${segment}" при слиянии компонентов пути.`))
          }
          n2i.set(segment, combined.length)
        }
        combined.push(segment)
      }
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash, hasEndSlash: newHasEndSlash, components: Object.freeze(combined), name2Index: freezeMap(n2i), path: null })
    }
    // 3. Первый путь
    if (path && newComponents) {
      const combined = [path, ...newComponents]
      const n2i = new Map()
      for (const [name, index] of newName2Index!) {
        n2i.set(name, index + 1)
      }
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash, hasEndSlash: newHasEndSlash, components: Object.freeze(combined), name2Index: freezeMap(n2i), path: null })
    }
    // 4. Второй путь
    if (components && newPath) {
      const combined = [...components, newPath]
      // Замороженный name2Index копировать необязательно - его структура не меняется
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash, hasEndSlash: newHasEndSlash, components: Object.freeze(combined), name2Index: name2Index!, path: null })
    }
    // 5. Первый не имеет пути
    if (newComponents || newPath) {
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash: hasStartSlash || newHasStartSlash, hasEndSlash: newHasEndSlash, components: newComponents, name2Index: newName2Index!, path: newPath })
    }
    // 6. Второй не имеет пути
    if (components || path) {
      return new PathComponents(
        // @ts-expect-error
        _EXTENDS_MARKER, { hasStartSlash, hasEndSlash: hasEndSlash || newHasStartSlash, components, name2Index, path })
    }
    // 7. Все не имеют пути. Здесь просто любой слеш
    return new PathComponents(
      // @ts-expect-error
      _EXTENDS_MARKER, { hasStartSlash: hasStartSlash || newHasStartSlash, hasEndSlash: false, components: null, name2Index: null, path: null })
  }

  toMutable (): MutablePath | MutablePathTemplate<T> {
    if (this._components) {
      return new MutablePathTemplate<T>(this as IPathComponentsParams)
    }
    return new MutablePath(this as IPathComponentsPath)
  }
}

/**
 * Обобщенный интерфейс компонентов пути.
 */
abstract class MutablePathComponents<T extends Record<string, string | number>> {
  /**
   * Имеет ли путь
   */
  abstract isEmpty (): boolean
  /**
   * Должен ли быть в начале пути слеш.
   */
  abstract readonly hasStartSlash: boolean
  /**
   * Должен ли быть в конце пути слеш.
   */
  abstract readonly hasEndSlash: boolean
  /**
   * Устанавливает параметры пути, если они поддерживаются.
   *
   * @param params Параметры пути вида `{id: '123'}`.
   */
  abstract use (params: UOptional<T>): void
  abstract useEntries (params: URecordToEntries<T>): void
  /**
   * Возвращает строковое представление пути без крайних слешей.
   */
  abstract toString (): string
  /**
   * Работает только для экземпляра с подстановочными параметрами
   */
  abstract filledOrThrow (): void
}


/**
 * Реализует {@link MutablePathComponents} для путей не имеющих подстановочные переменные.
 */
class MutablePath extends MutablePathComponents<{}> {
  protected readonly _cfg: IPathComponentsPath

  constructor(cfg: IPathComponentsPath) {
    super()
    this._cfg = cfg
  }

  isEmpty (): boolean {
    return !this._cfg.path
  }

  get hasStartSlash (): boolean {
    return this._cfg.hasStartSlash
  }

  get hasEndSlash (): boolean {
    return this._cfg.hasEndSlash
  }

  use (_params: UOptional<any>): void {
    console.warn('[MutablePath] Попытка установить переменные пути для маршрута который их не имеет.')
  }

  useEntries (_params: UOptional<any>): void {
    console.warn('[MutablePath] Попытка установить переменные пути для маршрута который их не имеет.')
  }

  toString (): string {
    return this._cfg.path ?? ''
  }

  filledOrThrow (): void {
    // ...
  }
}

/**
 * Реализует {@link MutablePathComponents} для путей имеющих подстановочные переменные.
 */
class MutablePathTemplate<T extends Record<string, string | number> = Record<string, string | number>> extends MutablePathComponents<T> {
  protected readonly _cfg: IPathComponentsParams
  protected readonly _components: string[]
  protected readonly _usedKeys = new Set<string>()

  constructor(cfg: IPathComponentsParams) {
    super()
    this._cfg = cfg
    this._components = [...cfg.components]
  }

  isEmpty (): boolean {
    // Маршруты с переменными не могут быть пустыми
    return false
  }

  get hasStartSlash (): boolean {
    return this._cfg.hasStartSlash
  }

  get hasEndSlash (): boolean {
    return this._cfg.hasEndSlash
  }

  use (params: UOptional<T>): void {
    for (const [key, value] of Object.entries(params) as [string, string][]) {
      if (this._cfg.name2Index.has(key)) {
        this._components[this._cfg.name2Index.get(key)!] = value
        this._usedKeys.add(key)
      }
      else {
        console.warn(`Параметр '${key}' не найден в пути "${this._components.join('/')}".`)
      }
    }
  }

  useEntries (params: URecordToEntries<T>): void {
    for (const [key, value] of params as [string, string][]) {
      if (this._cfg.name2Index.has(key)) {
        this._components[this._cfg.name2Index.get(key)!] = value
        this._usedKeys.add(key)
      }
      else {
        console.warn(`Параметр '${key}' не найден в пути "${this._components.join('/')}".`)
      }
    }
  }

  toString (): string {
    return this._components.join('/')
  }

  protected _throw (): never {
    const segments = []
    const missing = []
    const index2name = new Map()
    for (const [key, index] of this._cfg.name2Index) {
      if (!this._usedKeys.has(key)) {
        missing.push(key)
        index2name.set(index, key)
      }
    }
    for (let i = 0; i < this._components.length; ++i) {
      if (index2name.has(i)) {
        segments.push(`{${this._components[i]}}`)
      }
      else {
        segments.push(this._components[i])
      }
    }
    const path = segments.join('/')
    const detail = errorDetails.ProtocolError(`Не установлены все параметры '[${missing.join(', ')}]' пути: "${path}".`)
    detail.url = path
    throw new ProtocolError(detail)
  }

  filledOrThrow (): void {
    if (this._usedKeys.size !== this._cfg.name2Index.size) {
      this._throw()
    }
  }
}

export {
  type IPathComponentsBase,
  type IPathComponentsPath,
  type IPathComponentsParams,
  type TParsedPathComponents,
  parsePathComponents,
  parsedPathComponentsToString,
  PathComponents,
  MutablePathComponents,
  MutablePath,
  MutablePathTemplate
}
