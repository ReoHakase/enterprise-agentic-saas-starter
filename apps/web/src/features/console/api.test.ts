import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createConsoleApi } from "./api"

describe("ConsoleのEden API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("Console APIリクエストへ認証cookieと非キャッシュ方針を設定する", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        deletionId: "deletion-1",
        organizationId: "org-acme",
        status: "deleted",
      })
    )
    const api = createConsoleApi({
      baseUrl: "https://api.example.test",
      cookie: "better-auth.session_token=test",
    })

    await api.deleteOrganization("org-acme", {
      slug: "acme",
      confirmation: "DELETE",
      idempotencyKey: "delete_org_acme_request_01",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an Eden request")
    expect(call[1]).toMatchObject({
      cache: "no-store",
      credentials: "include",
    })
    expect(new Headers(call[1]?.headers).get("cookie")).toBe(
      "better-auth.session_token=test"
    )
  })
})
