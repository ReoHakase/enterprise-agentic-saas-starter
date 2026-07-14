import { beforeEach, describe, expect, it, vi } from "vitest"

import { decideInvitation } from "./api"

type InvitationDecisionResult = {
  data: unknown
  error: { code?: string; message?: string } | null
}
type DecideInvitation = (input: {
  invitationId: string
}) => Promise<InvitationDecisionResult>
type MockAuthClient = {
  organization: {
    acceptInvitation: DecideInvitation
    rejectInvitation: DecideInvitation
  }
}

const mocks = vi.hoisted(() => ({
  acceptInvitation: vi.fn<DecideInvitation>(),
  createAuthClientForBaseUrl: vi.fn<(baseUrl: string) => MockAuthClient>(),
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
        rejectInvitation: mocks.rejectInvitation,
      },
    })
    mocks.acceptInvitation.mockResolvedValue({ data: {}, error: null })
    mocks.rejectInvitation.mockResolvedValue({ data: {}, error: null })
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
