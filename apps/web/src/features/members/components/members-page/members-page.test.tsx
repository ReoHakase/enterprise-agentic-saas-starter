import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MembersPage } from "./members-page"

const mocks = vi.hoisted(() => ({
  listInvitations: vi.fn<(organizationId: string) => Promise<unknown>>(),
  listMembers: vi.fn<(organizationId: string) => Promise<unknown>>(),
  noop: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<(href: string) => void>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    activateOrganization: mocks.noop,
    cancelInvitation: mocks.noop,
    createInvitations: mocks.noop,
    listInvitations: mocks.listInvitations,
    listMembers: mocks.listMembers,
    removeMember: mocks.noop,
    resendInvitation: mocks.noop,
    transferSuperAdmin: mocks.noop,
    updateMemberRole: mocks.noop,
  },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}))

const organization = {
  id: "org-acme",
  name: "Acme",
  slug: "acme",
  role: "super_admin" as const,
  active: true,
  profileImage: null,
  memberCount: 1,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferSuperAdmin: true,
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  invitationCount: 1,
}

const member = {
  id: "member-owner",
  userId: "user-owner",
  name: "Owner",
  email: "owner@example.com",
  profileImage: null,
  githubLinked: true,
  passkeyLinked: true,
  role: "super_admin" as const,
  createdAt: "2026-07-01T00:00:00.000Z",
}

const invitation = {
  id: "invitation-1",
  email: "member@example.com",
  role: "member" as const,
  status: "pending" as const,
  organizationId: organization.id,
  inviterId: member.userId,
  inviter: {
    id: member.userId,
    name: member.name,
    email: member.email,
    profileImage: null,
  },
  expiresAt: "2026-07-21T00:00:00.000Z",
  createdAt: "2026-07-14T00:00:00.000Z",
}
const members = [member]
const invitations = [invitation]

describe("MembersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders server-seeded invitations without an intermediate loading state", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MembersPage
          organization={organization}
          initialMembers={members}
          initialInvitations={invitations}
        />
      </QueryClientProvider>
    )

    expect(screen.queryByText("Loading invitations")).not.toBeInTheDocument()
    expect(
      screen.getByRole("table", { name: "Invitations for Acme" })
    ).toBeVisible()
    expect(screen.getByText("member@example.com")).toBeVisible()
    expect(screen.getByTestId("organization-role-member")).toBeVisible()
    expect(screen.getByTestId("invitation-status-pending")).toBeVisible()
    expect(mocks.listInvitations).not.toHaveBeenCalled()
  })

  it("keeps members usable when the initial invitation fetch fails", () => {
    mocks.listInvitations.mockImplementationOnce(
      () => new Promise(() => undefined)
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MembersPage
          organization={organization}
          initialMembers={members}
          initialInvitationsError="Invitations are temporarily unavailable."
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole("table", { name: "Members of Acme" })).toBeVisible()
    expect(
      screen.getByText("Invitations are temporarily unavailable.")
    ).toBeVisible()
    expect(screen.queryByText("Loading invitations")).not.toBeInTheDocument()
  })
})
