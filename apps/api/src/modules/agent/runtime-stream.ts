import {
  captureObservedException,
  createObservedLogger,
} from "../../platform/observability/runtime"

const logger = createObservedLogger("agent").child("runtime")

export type AgentRuntimeSpanCompletion = {
  reject(reason?: unknown): void
  resolve(value?: void | PromiseLike<void>): void
}

export const observeAgentRuntimeStream = (
  spanCompletion: AgentRuntimeSpanCompletion,
  body: ReadableStream<Uint8Array>,
  requestId: string
) => {
  const reader = body.getReader()
  let settled = false
  const complete = () => {
    if (settled) return
    settled = true
    logger.info("Agent runtime response stream completed", {
      "agent.runtime.route": "/chat",
    })
    spanCompletion.resolve()
  }
  const fail = (cause: unknown) => {
    if (settled) return
    settled = true
    logger.error("Agent runtime response stream failed", {
      "app.error.code": "service_unavailable",
      "agent.runtime.route": "/chat",
    })
    captureObservedException(cause, {
      errorCode: "service_unavailable",
      method: "POST",
      requestId,
      route: "/agent/chat",
      statusCode: 503,
    })
    spanCompletion.reject(cause)
  }

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        complete()
      }
    },
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          complete()
          controller.close()
        } else {
          controller.enqueue(next.value)
        }
      } catch (cause) {
        fail(cause)
        controller.error(cause)
      }
    },
  })
}
