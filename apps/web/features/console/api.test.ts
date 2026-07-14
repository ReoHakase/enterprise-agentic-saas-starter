import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ConsoleApiError, createConsoleApi } from "./api"

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

  it("maps typed Eden errors without losing safe field recovery data", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "confirmation_required",
            message: "Confirmation does not match",
            context: {
              action: "organization.delete",
              field: "slug",
              organizationId: "must-not-be-exposed",
            },
            fieldErrors: {
              slug: ["Confirmation does not match"],
              constructor: ["must-not-be-used"],
            },
            requestId: "request-1",
          },
        },
        { status: 400 }
      )
    )
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })

    const error = await api
      .deleteOrganization("org-acme", {
        slug: "wrong",
        confirmation: "DELETE",
        idempotencyKey: "delete_org_acme_request_01",
      })
      .catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ConsoleApiError)
    if (!(error instanceof ConsoleApiError)) {
      throw new Error("Expected ConsoleApiError")
    }
    expect(error).toMatchObject<Partial<ConsoleApiError>>({
      code: "confirmation_required",
      message: "Confirmation does not match",
      requestId: "request-1",
      status: 400,
    })
    expect(error.context).toEqual({
      action: "organization.delete",
      field: "slug",
    })
    expect(error.fieldErrors).toEqual({
      slug: ["Confirmation does not match"],
    })
  })
})
