import { describe, expect, it, vi } from "vitest"

const observability = vi.hoisted(() => {
  const logger = {
    child: vi.fn<(segment: string) => unknown>(),
    debug: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
  }
  logger.child.mockReturnValue(logger)
  return {
    captureException:
      vi.fn<(error: unknown, context: Record<string, unknown>) => void>(),
    logger,
  }
})

vi.mock("../../platform/observability/runtime", () => ({
  captureObservedException: observability.captureException,
  createObservedLogger: () => observability.logger,
  injectObservedRequestHeaders: () => undefined,
  withObservedSpan: (
    _options: unknown,
    callback: (value: unknown) => unknown
  ) => callback({ endWhen: () => undefined }),
}))

import { observeAgentRuntimeStream } from "./runtime-stream"

describe("Agent runtime stream observability", () => {
  it("reports the original post-response failure once with request correlation", async () => {
    const cause = new Error("provider stream sentinel")
    const completion = Promise.withResolvers<void>()
    void completion.promise.catch(() => undefined)
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(cause)
      },
    })

    const stream = observeAgentRuntimeStream(
      completion,
      source,
      "req_stream_failure"
    )

    await expect(stream.getReader().read()).rejects.toBe(cause)
    await expect(completion.promise).rejects.toBe(cause)
    expect(observability.captureException).toHaveBeenCalledOnce()
    expect(observability.captureException).toHaveBeenCalledWith(cause, {
      errorCode: "service_unavailable",
      method: "POST",
      requestId: "req_stream_failure",
      route: "/agent/chat",
      statusCode: 503,
    })
  })
})
