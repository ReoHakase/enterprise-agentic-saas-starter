import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError } from "./error"
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

  it("renders the action fallback and safe support reference", () => {
    showConsoleApiErrorToast(
      new ConsoleApiError({
        code: "internal_error",
        message: "Internal server error",
        requestId: "req_toast_01",
        status: 500,
      }),
      "The session could not be revoked."
    )

    expect(mocks.toastError).toHaveBeenCalledWith(
      "The session could not be revoked.",
      {
        description:
          "Try again. If the problem continues, contact support. Reference ID: req_toast_01",
      }
    )
  })
})
