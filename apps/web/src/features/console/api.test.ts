import { EdenFetchError } from "@enterprise-agentic-saas/api/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createConsoleApi } from "./api"

const requestFrom = (input: RequestInfo | URL, init?: RequestInit) =>
  new Request(input, init)

describe("console Eden API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends an organization deletion through Eden and parses its receipt", async () => {
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

    await expect(
      api.deleteOrganization("org-acme", {
        slug: "acme",
        confirmation: "DELETE",
        idempotencyKey: "delete_org_acme_request_01",
      })
    ).resolves.toEqual({
      deletionId: "deletion-1",
      organizationId: "org-acme",
      status: "deleted",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an Eden request")
    const request = requestFrom(...call)
    expect(request.url).toBe("https://api.example.test/organizations/org-acme")
    expect(request.method).toBe("DELETE")
    expect(call[1]).toMatchObject({
      cache: "no-store",
      credentials: "include",
    })
    expect(new Headers(call[1]?.headers).get("cookie")).toBe(
      "better-auth.session_token=test"
    )
    await expect(request.json()).resolves.toEqual({
      slug: "acme",
      confirmation: "DELETE",
      idempotencyKey: "delete_org_acme_request_01",
    })
  })

  it("passes query cancellation through Eden to fetch", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([]))
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })
    const controller = new AbortController()

    await api.listOrganizations(controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })

  it("throws the native Eden error without converting it", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "confirmation_required" }, { status: 400 })
    )
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })

    const error = await api
      .deleteOrganization("org-acme", {
        slug: "wrong",
        confirmation: "DELETE",
        idempotencyKey: "delete_org_acme_request_01",
      })
      .catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(EdenFetchError)
    if (!(error instanceof EdenFetchError)) {
      throw new Error("Expected EdenFetchError")
    }
    expect(error).toMatchObject({
      status: 400,
      value: { error: "confirmation_required" },
    })
  })
})
