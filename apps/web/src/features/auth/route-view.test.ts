import { describe, expect, it } from "vitest"

import { resolveAuthRouteView } from "./route-view"

describe("認証route viewの解決", () => {
  describe("Given: アプリが提供する認証route", () => {
    it.each([
      ["sign-in", "signIn"],
      ["sign-out", "signOut"],
      ["sign-up", "signUp"],
      ["forgot-password", "forgotPassword"],
      ["reset-password", "resetPassword"],
      ["magic-link", "magicLink"],
    ] as const)(
      "When: %s を解決する Then: %s viewを返す",
      (path, expectedView) => {
        expect(resolveAuthRouteView(path)).toBe(expectedView)
      }
    )
  })

  describe("Given: アプリが提供しない認証route", () => {
    it("When: routeを解決する Then: pathを含む例外を投げる", () => {
      expect(() => resolveAuthRouteView("not-a-view")).toThrow(
        '[Better Auth UI] Unknown view path "not-a-view"'
      )
    })
  })
})
