import { afterEach, describe, expect, it, vi } from "vitest"

import { reportDevelopmentCauseChain } from "./development-error"

describe("development provider error reporting", () => {
  afterEach(() => vi.restoreAllMocks())

  it("prints the raw cause chain only in development", () => {
    const output = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const root = new Error("provider response", {
      cause: new Error("transport response"),
    })

    reportDevelopmentCauseChain(
      { NODE_ENV: "development" },
      "product-model",
      root
    )
    reportDevelopmentCauseChain({ NODE_ENV: "production" }, "hidden", root)
    reportDevelopmentCauseChain({ NODE_ENV: "test" }, "hidden", root)

    expect(output).toHaveBeenCalledTimes(2)
    expect(output.mock.calls[0]?.[1]).toBe(root)
    expect(output.mock.calls[1]?.[1]).toBe(root.cause)
  })
})
