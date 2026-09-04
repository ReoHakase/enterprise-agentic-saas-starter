import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import { clearAuthenticatedQueryCache } from "./query-cache"

describe("認証済みQuery cache", () => {
  it("進行中のQueryを取り消してからcacheを消去する", async () => {
    const queryClient = new QueryClient()
    const cancelQueries = vi.spyOn(queryClient, "cancelQueries")
    const clear = vi.spyOn(queryClient, "clear")

    await clearAuthenticatedQueryCache(queryClient)

    expect(cancelQueries).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
    expect(cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0] ?? 0
    )
  })
})
