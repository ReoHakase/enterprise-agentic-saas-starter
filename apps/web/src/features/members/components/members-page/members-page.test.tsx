import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
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
    listInvitations: mocks.listInvitations,
    listMembers: mocks.listMembers,
    removeMember: mocks.noop,
    transferOwnership: mocks.noop,
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
  role: "owner" as const,
  active: true,
  profileImage: null,
  memberCount: 1,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: true,
    canTransferOwnership: true,
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
  role: "owner" as const,
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
      <NuqsTestingAdapter hasMemory>
        <QueryClientProvider client={queryClient}>
          <MembersPage
            organization={organization}
            initialMembers={members}
            initialInvitations={invitations}
          />
        </QueryClientProvider>
      </NuqsTestingAdapter>
    )

    expect(screen.queryByText("Loading invitations")).not.toBeInTheDocument()
    const invitationsTable = screen.getByRole("table", {
      name: "Invitations for Acme",
    })
    expect(invitationsTable).toBeVisible()
    expect(screen.getAllByTestId("data-table-root")).toHaveLength(2)
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
      <NuqsTestingAdapter hasMemory>
        <QueryClientProvider client={queryClient}>
          <MembersPage
            organization={organization}
            initialMembers={members}
            initialInvitationsError="Invitations are temporarily unavailable."
          />
        </QueryClientProvider>
      </NuqsTestingAdapter>
    )

    const membersTable = screen.getByRole("table", {
      name: "Members of Acme",
    })
    expect(membersTable).toBeVisible()
    expect(screen.getByTestId("data-table-root")).toBeInTheDocument()
    expect(
      screen.getByText("Invitations are temporarily unavailable.")
    ).toBeVisible()
    expect(screen.queryByText("Loading invitations")).not.toBeInTheDocument()
  })

  it("clamps out-of-range member and invitation pages without updating URL state during mount", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
    const manyMembers = Array.from({ length: 21 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0")
      return {
        ...member,
        id: `member-${number}`,
        userId: `user-${number}`,
        name: `Member ${number}`,
        email: `member-${number}@example.com`,
        role: index === 0 ? ("owner" as const) : ("member" as const),
      }
    })
    const manyInvitations = Array.from({ length: 21 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0")
      return {
        ...invitation,
        id: `invitation-${number}`,
        email: `invite-${number}@example.com`,
        createdAt: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
      }
    })

    render(
      <NuqsTestingAdapter
        searchParams="page=9&inv_page=9"
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <QueryClientProvider client={queryClient}>
          <MembersPage
            organization={organization}
            initialMembers={manyMembers}
            initialInvitations={manyInvitations}
          />
        </QueryClientProvider>
      </NuqsTestingAdapter>
    )

    const membersTable = screen.getByRole("table", {
      name: "Members of Acme",
    })
    const invitationsTable = screen.getByRole("table", {
      name: "Invitations for Acme",
    })
    expect(within(membersTable).getByText("Member 21")).toBeVisible()
    expect(
      await within(invitationsTable).findByText("invite-01@example.com")
    ).toBeVisible()

    expect(onUrlUpdate).not.toHaveBeenCalled()
  })
})
