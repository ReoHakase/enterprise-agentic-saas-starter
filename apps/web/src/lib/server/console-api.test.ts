import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const api = { listOrganizations: vi.fn<() => void>() }
  return {
    api,
    createConsoleApi: vi.fn<
      (options: { baseUrl: string; cookie?: string }) => typeof api
    >(() => api),
    getCookieHeader: vi.fn<() => Promise<string>>(async () =>
      Promise.resolve("session=request-scoped")
    ),
  }
})

vi.mock("@/features/console/api", () => ({
  createConsoleApi: mocks.createConsoleApi,
}))
vi.mock("@/lib/env.server", () => ({
  serverEnv: { API_PUBLIC_URL: "https://api.example.test" },
}))
vi.mock("@/lib/server/auth", () => ({
  getCookieHeader: mocks.getCookieHeader,
}))

import { createServerConsoleApi } from "./console-api"

describe("サーバーコンソール API", () => {
  it("リクエストCookieをConsole API clientへ渡す", async () => {
    const api = await createServerConsoleApi()

    expect(mocks.getCookieHeader).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
      cookie: "session=request-scoped",
    })
    expect(api).toBe(mocks.api)
  })
})
