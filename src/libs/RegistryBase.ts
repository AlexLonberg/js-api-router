class RegistryBase<TKey, TValue> {
  protected readonly _items = new Map<TKey, TValue>()
  protected _frozen = false

  get keys (): MapIterator<TKey> {
    return this._items.keys()
  }

  get frozen (): boolean {
    return this._frozen
  }

  /**
   * Запретить добавление новых элементов.
   */
  freeze (): void {
    this._frozen = true
  }

  has (key: TKey): boolean {
    return this._items.has(key)
  }
}

export {
  RegistryBase
}
