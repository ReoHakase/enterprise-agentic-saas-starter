import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  decideInvitation,
  getInvitationContext,
  InvitationAuthenticationError,
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
type MockAuthClient = {
  organization: {
    acceptInvitation: DecideInvitation
    getInvitation: GetInvitation
    rejectInvitation: DecideInvitation
  }
}

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn<DecideInvitation>(),
  createAuthClientForBaseUrl: vi.fn<(baseUrl: string) => MockAuthClient>(),
  getInvitation: vi.fn<GetInvitation>(),
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
        role: "super_admin",
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

  it("surfaces an allowlisted Better Auth error code", async () => {
    mocks.acceptInvitation.mockResolvedValueOnce({
      data: null,
      error: {
        code: "INVITATION_NOT_FOUND",
        message: "SELECT token FROM invitation",
      },
    })

    await expect(
      decideInvitation({
        action: "accept",
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).rejects.toThrow("This invitation is no longer available.")
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
      ).rejects.toBeInstanceOf(InvitationAuthenticationError)
    }
  )

  it.each(["accept", "reject"] as const)(
    "hides unknown provider details when an invitation cannot be %sed",
    async (action) => {
      const request =
        action === "accept" ? mocks.acceptInvitation : mocks.rejectInvitation
      request.mockRejectedValueOnce(
        new Error("BETTER_AUTH_SECRET=provider-secret")
      )

      await expect(
        decideInvitation({
          action,
          apiBaseUrl: "https://api.example.test",
          invitationId: "invitation-1",
        })
      ).rejects.toThrow(
        action === "accept"
          ? "Invitation could not be accepted. Try again."
          : "Invitation could not be rejected. Try again."
      )
    }
  )

  it("uses an operation fallback for an unknown returned error code", async () => {
    mocks.acceptInvitation.mockResolvedValueOnce({
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "TURSO_AUTH_TOKEN=provider-secret",
      },
    })

    await expect(
      decideInvitation({
        action: "accept",
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).rejects.toThrow("Invitation could not be accepted. Try again.")
  })
})
