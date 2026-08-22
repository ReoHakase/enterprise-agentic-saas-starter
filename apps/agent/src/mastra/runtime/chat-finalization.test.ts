import { describe, expect, it, vi } from "vitest"

import { createRunFinalizer } from "./chat-finalization"

describe("createRunFinalizer", () => {
  it("preserves the finalization cause at the observability boundary", async () => {
    const cause = new Error("private settlement failure")
    const reportFailure = vi.fn<(cause: unknown) => void>()
    const captureFailure = vi.fn<(code: string) => void>()
    const release = vi.fn<() => void>()
    const fail = vi.fn<() => Promise<void>>().mockResolvedValue()
    const pending: Promise<unknown>[] = []
    const finalizer = createRunFinalizer({
      abort: { close: vi.fn<() => void>(), getCause: () => undefined },
      captureFailure,
      context: { waitUntil: (promise) => pending.push(promise) },
      release,
      reportFailure,
      settlement: {
        cancel: vi.fn<() => Promise<void>>().mockResolvedValue(),
        complete: () => Promise.reject(cause),
        fail,
        holdForApproval: vi.fn<() => void>(),
      },
    })

    await expect(
      finalizer.finish(async () => undefined)
    ).resolves.toBeUndefined()
    await Promise.all(pending)

    expect(reportFailure).toHaveBeenCalledOnce()
    expect(reportFailure).toHaveBeenCalledWith(cause)
    expect(captureFailure).toHaveBeenCalledWith("run_finalization_failed")
    expect(fail).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
  })
})
