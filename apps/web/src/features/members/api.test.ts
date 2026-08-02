import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  decideInvitation,
  getInvitationContext,
  sendOrganizationInvitation,
} from "./api"

type InvitationDecisionResult = {
  data: unknown
  error: {
    code?: string
    message?: string
    status?: number
    statusCode?: number
  } | null
}
type DecideInvitation = (input: {
  invitationId: string
}) => Promise<InvitationDecisionResult>
type GetInvitation = (input: {
  query: { id: string }
  fetchOptions: {
    cache: "no-store"
    credentials: "include"
    headers?: { cookie: string }
  }
}) => Promise<InvitationDecisionResult>
type InviteMember = (input: {
  email: string
  organizationId: string
  resend: boolean
  role: "admin" | "member"
  fetchOptions: {
    credentials: "include"
    headers?: { cookie: string }
    throw: true
  }
}) => Promise<unknown>
type MockAuthClient = {
  organization: {
    acceptInvitation: DecideInvitation
    getInvitation: GetInvitation
    inviteMember: InviteMember
    rejectInvitation: DecideInvitation
  }
}

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn<DecideInvitation>(),
  createAuthClientForBaseUrl: vi.fn<(baseUrl: string) => MockAuthClient>(),
  getInvitation: vi.fn<GetInvitation>(),
  inviteMember: vi.fn<InviteMember>(),
  rejectInvitation: vi.fn<DecideInvitation>(),
}))

vi.mock("@enterprise-agentic-saas/auth/client", () => ({
  createAuthClientForBaseUrl: mocks.createAuthClientForBaseUrl,
}))

describe("invitation decision API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createAuthClientForBaseUrl.mockReturnValue({
      organization: {
        acceptInvitation: mocks.acceptInvitation,
        getInvitation: mocks.getInvitation,
        inviteMember: mocks.inviteMember,
        rejectInvitation: mocks.rejectInvitation,
      },
    })
    mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null })
    mocks.getInvitation.mockResolvedValue({
      data: {
        id: "invitation-1",
        organizationId: "org-1",
        organizationName: "Acme",
        organizationSlug: "acme",
        inviterEmail: "owner@example.test",
        role: "member",
        status: "pending",
        expiresAt: "2026-07-18T00:00:00.000Z",
        createdAt: "2026-07-16T00:00:00.000Z",
      },
      error: null,
    })
    mocks.rejectInvitation.mockResolvedValue({ data: {}, error: null })
    mocks.inviteMember.mockResolvedValue({ id: "invitation-1" })
  })

  it("loads and normalizes the invitation only for the active recipient", async () => {
    const result = await getInvitationContext({
      apiBaseUrl: "https://api.example.test",
      cookie: "session=recipient",
      invitationId: "invitation-1",
    })

    expect(mocks.getInvitation).toHaveBeenCalledWith({
      query: { id: "invitation-1" },
      fetchOptions: {
        cache: "no-store",
        credentials: "include",
        headers: { cookie: "session=recipient" },
      },
    })
    expect(result).toEqual({
      kind: "ready",
      invitation: expect.objectContaining({
        id: "invitation-1",
        organizationName: "Acme",
        createdAt: "2026-07-16T00:00:00.000Z",
        expiresAt: "2026-07-18T00:00:00.000Z",
      }),
    })
  })

  it.each([false, true])(
    "uses Better Auth's single-recipient invitation contract with resend=%s",
    async (resend) => {
      await sendOrganizationInvitation({
        apiBaseUrl: "https://api.example.test",
        cookie: "session=owner",
        email: "member@example.com",
        organizationId: "org-1",
        resend,
        role: "member",
      })

      expect(mocks.inviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        organizationId: "org-1",
        resend,
        role: "member",
        fetchOptions: {
          credentials: "include",
          headers: { cookie: "session=owner" },
          throw: true,
        },
      })
    }
  )

  it.each([
    [{ status: 403 }, "recipient_mismatch"],
    [
      { code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" },
      "recipient_mismatch",
    ],
    [{ status: 401 }, "signed_out"],
    [{ statusCode: 401 }, "signed_out"],
    [{ code: "SESSION_EXPIRED" }, "signed_out"],
    [{ status: 400 }, "unavailable"],
    [{ code: "INVITATION_NOT_FOUND" }, "unavailable"],
    [{ status: 503 }, "load_error"],
  ] as const)(
    "classifies invitation lookup failures without exposing provider details",
    async (error, kind) => {
      mocks.getInvitation.mockResolvedValueOnce({
        data: null,
        error: { ...error, message: "SELECT email FROM invitation" },
      })

      await expect(
        getInvitationContext({
          apiBaseUrl: "https://api.example.test",
          invitationId: "invitation-1",
        })
      ).resolves.toEqual({ kind })
    }
  )

  it("offers a retry when invitation context does not match the web schema", async () => {
    mocks.getInvitation.mockResolvedValueOnce({
      data: {
        id: "invitation-1",
        organizationName: "Acme",
        role: "owner",
      },
      error: null,
    })

    await expect(
      getInvitationContext({
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).resolves.toEqual({ kind: "load_error" })
  })

  it("offers a retry when the invitation lookup rejects", async () => {
    mocks.getInvitation.mockRejectedValueOnce(new Error("upstream unavailable"))

    await expect(
      getInvitationContext({
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).resolves.toEqual({ kind: "load_error" })
  })

  it.each(["accept", "reject"] as const)(
    "uses the Better Auth client to %s an invitation",
    async (action) => {
      await decideInvitation({
        action,
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })

      expect(mocks.createAuthClientForBaseUrl).toHaveBeenCalledWith(
        "https://api.example.test"
      )
      const expected =
        action === "accept" ? mocks.acceptInvitation : mocks.rejectInvitation
      expect(expected).toHaveBeenCalledWith({ invitationId: "invitation-1" })
    }
  )

  it("preserves a returned Better Auth decision error", async () => {
    const error = {
      code: "INVITATION_NOT_FOUND",
      message: "SELECT token FROM invitation",
    }
    mocks.acceptInvitation.mockResolvedValueOnce({
      data: null,
      error,
    })

    await expect(
      decideInvitation({
        action: "accept",
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).rejects.toBe(error)
  })

  it.each([{ status: 401 }, { statusCode: 401 }, { code: "SESSION_EXPIRED" }])(
    "returns to authentication when a decision loses its session",
    async (error) => {
      mocks.acceptInvitation.mockResolvedValueOnce({
        data: null,
        error,
      })

      await expect(
        decideInvitation({
          action: "accept",
          apiBaseUrl: "https://api.example.test",
          invitationId: "invitation-1",
        })
      ).rejects.toBe(error)
    }
  )

  it.each(["accept", "reject"] as const)(
    "preserves a rejected provider error when an invitation cannot be %sed",
    async (action) => {
      const request =
        action === "accept" ? mocks.acceptInvitation : mocks.rejectInvitation
      const error = new Error("BETTER_AUTH_SECRET=provider-secret")
      request.mockRejectedValueOnce(error)

      await expect(
        decideInvitation({
          action,
          apiBaseUrl: "https://api.example.test",
          invitationId: "invitation-1",
        })
      ).rejects.toBe(error)
    }
  )

  it("preserves an unknown returned error", async () => {
    const error = {
      code: "INTERNAL_ERROR",
      message: "TURSO_AUTH_TOKEN=provider-secret",
    }
    mocks.acceptInvitation.mockResolvedValueOnce({
      data: null,
      error,
    })

    await expect(
      decideInvitation({
        action: "accept",
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).rejects.toBe(error)
  })
})
