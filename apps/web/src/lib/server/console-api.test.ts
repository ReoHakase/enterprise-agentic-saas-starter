import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const state: { factory?: () => Promise<unknown> } = {}
  const cached = vi.fn<() => void>()
  return {
    cached,
    createConsoleApi: vi.fn<
      (options: { baseUrl: string; cookie?: string }) => {
        listOrganizations: () => void
      }
    >(() => ({ listOrganizations: vi.fn<() => void>() })),
    getCookieHeader: vi.fn<() => Promise<string>>(async () =>
      Promise.resolve("session=request-scoped")
    ),
    reactCache: vi.fn<(factory: () => Promise<unknown>) => typeof cached>(
      (factory) => {
        state.factory = factory
        return cached
      }
    ),
    state,
  }
})

vi.mock("server-only", () => ({}))
vi.mock("react", () => ({ cache: mocks.reactCache }))
vi.mock("@/features/console", () => ({
  createConsoleApi: mocks.createConsoleApi,
}))
vi.mock("@/lib/env.server", () => ({
  serverEnv: { API_PUBLIC_URL: "https://api.example.test" },
}))
vi.mock("@/lib/server/auth", () => ({
  getCookieHeader: mocks.getCookieHeader,
}))

describe("server console API", () => {
  it("keeps creation inside React cache and forwards the request cookie", async () => {
    const { createServerConsoleApi } = await import("./console-api")

    expect(mocks.reactCache).toHaveBeenCalledOnce()
    expect(createServerConsoleApi).toBe(mocks.cached)
    expect(mocks.getCookieHeader).not.toHaveBeenCalled()

    const factory = mocks.state.factory
    if (!factory) throw new Error("Expected React cache factory")
    await factory()

    expect(mocks.getCookieHeader).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
      cookie: "session=request-scoped",
    })
  })
})
