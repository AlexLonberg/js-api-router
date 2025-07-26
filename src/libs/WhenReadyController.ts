class WhenReadyController {
  private _promise: null | Promise<boolean> = null
  private _resolve: null | ((_: boolean) => any) = null

  get alive (): boolean {
    return !!this._promise
  }

  get promise (): Promise<boolean> {
    return this._promise ?? Promise.resolve(false)
  }

  charge (): Promise<boolean> {
    if (!this._promise) {
      this._promise = new Promise((resolve) => this._resolve = resolve)
    }
    return this._promise
  }

  resolve (value: boolean): void {
    const resolve = this._resolve
    this._promise = null
    this._resolve = null
    resolve?.(value)
  }
}

export {
  WhenReadyController
}
