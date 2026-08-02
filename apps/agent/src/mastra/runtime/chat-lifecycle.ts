const RUN_TIMEOUT_MS = 270_000
const noop = () => undefined

export type AbortCause = "revoked" | "total_timeout" | "user"

export const createRunAbortLifecycle = (request: Request) => {
  const controller = new AbortController()
  let cause: AbortCause | undefined
  let closed = false
  const abortFrom = (nextCause: AbortCause, reason: unknown) => {
    if (closed || cause) return
    cause = nextCause
    controller.abort(reason)
  }
  const onRequestAbort = () =>
    abortFrom(
      "user",
      request.signal.reason ?? new DOMException("Aborted", "AbortError")
    )
  request.signal.addEventListener("abort", onRequestAbort, { once: true })
  if (request.signal.aborted) onRequestAbort()
  const totalTimeoutTimer = setTimeout(
    () =>
      abortFrom(
        "total_timeout",
        new DOMException("Agent run timed out", "TimeoutError")
      ),
    RUN_TIMEOUT_MS
  )
  const close = () => {
    if (closed) return
    closed = true
    clearTimeout(totalTimeoutTimer)
    request.signal.removeEventListener("abort", onRequestAbort)
  }
  return {
    abortFrom,
    close,
    getCause: () => cause,
    signal: controller.signal,
  }
}

export const waitForAbortable = async <Value>(
  operation: Promise<Value>,
  signal: AbortSignal
): Promise<Value> => {
  signal.throwIfAborted()
  let onAbort: () => void = noop
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })
  try {
    return await Promise.race([operation, aborted])
  } finally {
    signal.removeEventListener("abort", onAbort)
  }
}
