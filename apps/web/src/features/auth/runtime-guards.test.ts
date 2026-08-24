import { createAuthClientForBaseUrl } from "@enterprise-agentic-saas/auth/client"
import { describe, expect, it } from "vitest"

import {
  formDataString,
  requireMagicLinkAuthClient,
  requireMultiSessionAuthClient,
  requirePasskeyAuthClient,
} from "./runtime-guards"

describe("認証ランタイムガード", () => {
  it.each([
    {
      caseLabel: "マジックリンク",
      requireClient: requireMagicLinkAuthClient,
    },
    {
      caseLabel: "複数セッション",
      requireClient: requireMultiSessionAuthClient,
    },
    { caseLabel: "パスキー", requireClient: requirePasskeyAuthClient },
  ])("$caseLabel用pluginを備えたclientを受け入れる", ({ requireClient }) => {
    const client = createAuthClientForBaseUrl("http://localhost:3001")

    expect(requireClient(client)).toBe(client)
  })

  it.each([
    {
      caseLabel: "マジックリンクmethodがない",
      client: { signIn: {} },
      requireClient: requireMagicLinkAuthClient,
      expected: "Magic link authentication is not configured",
    },
    {
      caseLabel: "パスキーのサインインmethodがない",
      client: { signIn: {} },
      requireClient: requirePasskeyAuthClient,
      expected: "Passkey authentication is not configured",
    },
    {
      caseLabel: "パスキーの管理methodがない",
      client: { signIn: { passkey: () => undefined } },
      requireClient: requirePasskeyAuthClient,
      expected: "Passkey authentication is not configured",
    },
    {
      caseLabel: "複数セッションmethodがない",
      client: { multiSession: {} },
      requireClient: requireMultiSessionAuthClient,
      expected: "Account switching is not configured",
    },
  ])("$caseLabelのclientを拒否する", ({ client, expected, requireClient }) => {
    expect(() => requireClient(client)).toThrow(expected)
  })

  it("フォーム値を正規化する", () => {
    const formData = new FormData()
    formData.set("email", "user@example.test")

    expect(formDataString(formData, "email")).toBe("user@example.test")
    expect(formDataString(formData, "missing")).toBe("")
  })
})
