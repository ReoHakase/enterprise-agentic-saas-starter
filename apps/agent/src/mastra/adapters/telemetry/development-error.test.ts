import { describe, expect, it, vi } from "vitest"

import { reportDevelopmentCauseChain } from "./development-error"

const local = {
  DEV_SESSION_ID: "session-1",
  DEV_WORKTREE_ID: "feature-auth",
  NODE_ENV: "development",
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
}

describe("development provider error reporting", () => {
  it("keeps rich provider errors and bounds the cause chain", () => {
    const consoleError = vi.fn<(message: string, error: unknown) => void>()
    const logError =
      vi.fn<(message: string, attributes: Record<string, unknown>) => void>()
    let cause: Error | undefined
    for (let index = 0; index < 7; index += 1) {
      cause = new Error(`provider quota detail ${index}`, { cause })
    }

    reportDevelopmentCauseChain(local, "product-model", cause, {
      consoleError,
      logError,
    })

    expect(consoleError).toHaveBeenCalledTimes(5)
    expect(consoleError.mock.calls[0]?.[1]).toMatchObject({
      message: "provider quota detail 6",
    })
    expect(logError).toHaveBeenCalledTimes(5)
    expect(logError.mock.calls[0]?.[1]).toMatchObject({
      "dev.session.id": "session-1",
      "dev.worktree.id": "feature-auth",
      label: "product-model",
    })
  })

  it("stays disabled outside the complete fixed local identity", () => {
    const consoleError = vi.fn<(message: string, error: unknown) => void>()
    const logError =
      vi.fn<(message: string, attributes: Record<string, unknown>) => void>()
    const sink = { consoleError, logError }
    const error = new Error("provider response")

    for (const environment of [
      { ...local, NODE_ENV: "production" },
      {
        ...local,
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://remote.example.test",
      },
      { ...local, DEV_SESSION_ID: "" },
      { ...local, DEV_WORKTREE_ID: "" },
    ]) {
      reportDevelopmentCauseChain(environment, "hidden", error, sink)
    }

    expect(consoleError).not.toHaveBeenCalled()
    expect(logError).not.toHaveBeenCalled()
  })
})
