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
    reactCache: vi.fn<
      (factory: () => Promise<unknown>) => () => Promise<unknown>
    >((factory) => {
      let result: Promise<unknown> | undefined
      return () => (result ??= factory())
    }),
  }
})

vi.mock("server-only", () => ({}))
vi.mock("react", () => ({ cache: mocks.reactCache }))
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

describe("server console API", () => {
  it("creates the client inside React cache with the request cookie", async () => {
    expect(mocks.reactCache).toHaveBeenCalledOnce()
    expect(createServerConsoleApi).toBe(mocks.reactCache.mock.results[0]?.value)
    expect(mocks.getCookieHeader).not.toHaveBeenCalled()

    const first = await createServerConsoleApi()
    const second = await createServerConsoleApi()

    expect(mocks.getCookieHeader).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
      cookie: "session=request-scoped",
    })
    expect(first).toBe(mocks.api)
    expect(second).toBe(first)
  })
})
