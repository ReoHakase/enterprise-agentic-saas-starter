const noop = () => undefined

export const createDeferred = <Value>() => {
  let resolve: (value: Value | PromiseLike<Value>) => void = noop
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}
