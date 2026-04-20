export function lazy<T>(fn: () => T | Promise<T>) {
  let value: T | undefined
  let loaded = false
  let failed = false

  const result = (): T => {
    if (loaded && !failed) return value as T
    try {
      const result = fn()
      if (result instanceof Promise) {
        return result
          .then((v) => {
            value = v
            loaded = true
            failed = false
            return v
          })
          .catch((e) => {
            loaded = false
            failed = false
            throw e
          }) as unknown as T
      }
      value = result
      loaded = true
      failed = false
      return value as T
    } catch (e) {
      if (loaded) {
        loaded = false
        failed = true
      }
      throw e
    }
  }

  result.reset = () => {
    loaded = false
    failed = false
    value = undefined
  }

  return result
}
