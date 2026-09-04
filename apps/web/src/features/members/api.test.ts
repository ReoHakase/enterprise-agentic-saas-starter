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

describe("招待への判断API", () => {
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

  it("有効な受信者に対してだけ招待を読み込み正規化する", async () => {
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
    "resend=%sを指定したBetter Authの単一受信者招待契約を使う",
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
    {
      case: "受信者不一致のstatus",
      error: { status: 403 },
      kind: "recipient_mismatch",
    },
    {
      case: "受信者不一致のcode",
      error: { code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION" },
      kind: "recipient_mismatch",
    },
    { case: "未認証のstatus", error: { status: 401 }, kind: "signed_out" },
    {
      case: "未認証のstatusCode",
      error: { statusCode: 401 },
      kind: "signed_out",
    },
    {
      case: "期限切れのcode",
      error: { code: "SESSION_EXPIRED" },
      kind: "signed_out",
    },
    { case: "利用不能のstatus", error: { status: 400 }, kind: "unavailable" },
    {
      case: "招待なしのcode",
      error: { code: "INVITATION_NOT_FOUND" },
      kind: "unavailable",
    },
    { case: "一時障害のstatus", error: { status: 503 }, kind: "load_error" },
  ] as const)(
    "$caseをプロバイダー詳細の公開なしで分類する",
    async ({ error, kind }) => {
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

  it("招待contextがWeb schemaと一致しない場合に再試行を提示する", async () => {
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

  it("招待取得が拒否された場合に再試行を提示する", async () => {
    mocks.getInvitation.mockRejectedValueOnce(new Error("upstream unavailable"))

    await expect(
      getInvitationContext({
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })
    ).resolves.toEqual({ kind: "load_error" })
  })

  it.each([
    {
      action: "accept",
      caseLabel: "承諾",
      request: mocks.acceptInvitation,
    },
    {
      action: "reject",
      caseLabel: "拒否",
      request: mocks.rejectInvitation,
    },
  ] as const)(
    "招待の$caseLabelを指定したAPIの対応methodへ送る",
    async ({ action, request }) => {
      await decideInvitation({
        action,
        apiBaseUrl: "https://api.example.test",
        invitationId: "invitation-1",
      })

      expect(mocks.createAuthClientForBaseUrl).toHaveBeenCalledWith(
        "https://api.example.test"
      )
      expect(request).toHaveBeenCalledWith({ invitationId: "invitation-1" })
    }
  )

  it("Better Authが返した判断エラーを保持する", async () => {
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
})
