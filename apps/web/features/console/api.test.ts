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

  it("sends normalized bulk invitations through Eden and parses the queued response", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        invitations: [
          {
            id: "invitation-1",
            email: "first@example.com",
            role: "member",
            status: "pending",
            organizationId: "org-acme",
            inviterId: "user-owner",
            inviter: {
              id: "user-owner",
              name: "Owner",
              email: "owner@example.com",
              image: null,
            },
            expiresAt: "2026-07-22T00:00:00.000Z",
            createdAt: "2026-07-15T00:00:00.000Z",
          },
          {
            id: "invitation-2",
            email: "second@example.com",
            role: "member",
            status: "pending",
            organizationId: "org-acme",
            inviterId: "user-owner",
            inviter: {
              id: "user-owner",
              name: "Owner",
              email: "owner@example.com",
              image: null,
            },
            expiresAt: "2026-07-22T00:00:00.000Z",
            createdAt: "2026-07-15T00:00:00.000Z",
          },
        ],
        queuedCount: 2,
        delivery: "queued",
      })
    )
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })

    await expect(
      api.createInvitations("org-acme", {
        emails: ["first@example.com", "second@example.com"],
        role: "member",
      })
    ).resolves.toMatchObject({
      queuedCount: 2,
      delivery: "queued",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an Eden request")
    const request = requestFrom(...call)
    expect(request.url).toBe(
      "https://api.example.test/organizations/org-acme/invitations"
    )
    expect(request.method).toBe("POST")
    await expect(request.json()).resolves.toEqual({
      emails: ["first@example.com", "second@example.com"],
      role: "member",
    })
  })

  it("queues an invitation resend through Eden and parses revival metadata", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        invitation: {
          id: "invitation-1",
          email: "expired@example.com",
          role: "member",
          status: "pending",
          organizationId: "org-acme",
          inviterId: "user-owner",
          inviter: {
            id: "user-owner",
            name: "Owner",
            email: "owner@example.com",
            image: null,
          },
          expiresAt: "2026-07-23T00:00:00.000Z",
          createdAt: "2026-07-15T00:00:00.000Z",
        },
        delivery: "queued",
        revived: true,
      })
    )
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })

    await expect(
      api.resendInvitation("org-acme", "invitation-1")
    ).resolves.toMatchObject({ delivery: "queued", revived: true })

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    if (!call) throw new Error("Expected an Eden request")
    const request = requestFrom(...call)
    expect(request.url).toBe(
      "https://api.example.test/organizations/org-acme/invitations/invitation-1/resend"
    )
    expect(request.method).toBe("POST")
  })

  it("passes query cancellation through Eden to fetch", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([]))
    const api = createConsoleApi({ baseUrl: "https://api.example.test" })
    const controller = new AbortController()

    await api.listOrganizations(controller.signal)

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
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
