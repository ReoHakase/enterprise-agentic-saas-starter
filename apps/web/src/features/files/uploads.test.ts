import { afterEach, describe, expect, it, vi } from "vitest"

import { cancelActiveFileUploads, registerFileUpload } from "./uploads"

describe("実行中のファイルupload", () => {
  afterEach(() => cancelActiveFileUploads())

  it("組織の切り替え中に登録済みのアップロードを中止する", () => {
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
