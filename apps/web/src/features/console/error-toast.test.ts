import { beforeEach, describe, expect, it, vi } from "vitest"

import { httpError } from "@/test-support/http-error"

import { showConsoleApiErrorToast } from "./error-toast"

const mocks = vi.hoisted(() => ({
  toastError:
    vi.fn<(message: string, options?: { description?: string }) => void>(),
}))

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}))

describe("console API error toast", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renders only fixed action and recovery copy", () => {
    showConsoleApiErrorToast(
      httpError(500, "internal_error"),
      "The session could not be revoked."
    )

    expect(mocks.toastError).toHaveBeenCalledWith(
      "The session could not be revoked.",
      {
        description: "Try again. If the problem continues, contact support.",
      }
    )
  })
})
