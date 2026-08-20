import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createApiClient: vi.fn<
    (
      baseUrl: string,
      options: {
        fetch: { cache: string; credentials: string }
        headers?: { cookie: string }
      }
    ) => object
  >(() => ({})),
}))

vi.mock("@enterprise-agentic-saas/api/client", () => ({
  createApiClient: mocks.createApiClient,
}))
vi.mock("@/lib/env.client", () => ({
  clientEnv: {
    NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
  },
}))

import { browserConsoleApi } from "./console-api"

describe("browser console API", () => {
  it("creates one eager singleton through the cycle-free feature adapter", () => {
    expect(mocks.createApiClient).toHaveBeenCalledOnce()
    expect(mocks.createApiClient).toHaveBeenCalledWith(
      "https://api.example.test",
      {
        fetch: {
          cache: "no-store",
          credentials: "include",
        },
        headers: undefined,
      }
    )
    expect(browserConsoleApi).toMatchObject({
      getMe: expect.any(Function),
      listOrganizations: expect.any(Function),
    })
  })
})
