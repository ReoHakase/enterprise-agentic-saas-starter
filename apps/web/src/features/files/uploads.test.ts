import { afterEach, describe, expect, it, vi } from "vitest"

import { cancelActiveFileUploads, registerFileUpload } from "./uploads"

describe("active file uploads", () => {
  afterEach(() => cancelActiveFileUploads())

  it("aborts registered uploads during an organization switch", () => {
    const first = new AbortController()
    const second = new AbortController()
    const firstAbort = vi.spyOn(first, "abort")
    const secondAbort = vi.spyOn(second, "abort")
    registerFileUpload(first)
    const unregisterSecond = registerFileUpload(second)
    unregisterSecond()

    cancelActiveFileUploads()

    expect(firstAbort).toHaveBeenCalledOnce()
    expect(secondAbort).not.toHaveBeenCalled()
  })
})
