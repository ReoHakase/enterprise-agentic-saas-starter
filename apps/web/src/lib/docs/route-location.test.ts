import { afterEach, describe, expect, test, vi } from "vitest"

import { getRouter } from "@/router"

vi.mock("@/lib/docs/source.server", () => ({ source: {} }))
vi.mock("collections/browser", () => ({
  default: {
    docs: {
      createClientLoader: () => ({
        preload: () => Promise.resolve(),
        useContent: () => null,
      }),
    },
  },
}))

describe("ドキュメントrouteのlocation契約", () => {
  afterEach(() => vi.restoreAllMocks())

  test("ルートURLをindex routeへ一意に解決する", () => {
    // Given: /docsを表示中のWeb routerを作る
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const router = getRouter()

    // When: ドキュメントのルートURLをlocationへ解決する
    const location = router.buildLocation({ to: "/docs" })

    // Then: 空のsplatではなくindex routeがURLを所有する
    expect(location.pathname).toBe("/docs")
    expect(router.matchRoutes(location.pathname).at(-1)?.routeId).toBe(
      "/(public)/docs/"
    )
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'Generated path "/docs" for route "/(public)/docs" matched route'
      )
    )
  })
})
