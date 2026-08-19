import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const api = { getMe: vi.fn<() => void>() }
  return {
    api,
    createConsoleApi: vi.fn<(options: { baseUrl: string }) => typeof api>(
      () => api
    ),
  }
})

vi.mock("@/features/console", () => ({
  createConsoleApi: mocks.createConsoleApi,
}))
vi.mock("@/lib/env.client", () => ({
  clientEnv: {
    NEXT_PUBLIC_API_BASE_URL: "https://api.example.test",
  },
}))

beforeEach(() => {
  vi.resetModules()
  mocks.createConsoleApi.mockClear()
})

describe("browser console API", () => {
  it("creates one stable client lazily from the public API URL", async () => {
    const { getBrowserConsoleApi } = await import("./console-api")

    expect(mocks.createConsoleApi).not.toHaveBeenCalled()

    const first = getBrowserConsoleApi()
    const second = getBrowserConsoleApi()

    expect(mocks.createConsoleApi).toHaveBeenCalledOnce()
    expect(mocks.createConsoleApi).toHaveBeenCalledWith({
      baseUrl: "https://api.example.test",
    })
    expect(first).toBe(mocks.api)
    expect(second).toBe(first)
  })
})
