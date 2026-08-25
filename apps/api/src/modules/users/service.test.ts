import { describe, expect, it, vi } from "vitest"

import type { UsersPorts } from "./ports"
import { createUsersService } from "./service"

const organization = {
  id: "org_1",
  name: "Acme",
  slug: "acme",
  profileImage: null,
  role: "admin" as const,
  active: false,
  memberCount: 2,
  memberProfileImages: [],
  permissions: {
    canEditOrganization: true,
    canInviteMembers: true,
    canManageMembers: true,
    canManageAdmins: false,
    canTransferOwnership: false,
  },
}

const createPorts = (overrides: Partial<UsersPorts> = {}): UsersPorts => ({
  deleteOtherSessions: vi.fn<UsersPorts["deleteOtherSessions"]>(async () => ({
    revoked: 0,
  })),
  deleteSession: vi.fn<UsersPorts["deleteSession"]>(async () => ({
    id: "session_1",
  })),
  findUser: vi.fn<UsersPorts["findUser"]>(async () => ({
    id: "user_1",
    name: "User",
    email: "user@example.test",
    profileImage: null,
  })),
  listMcpOAuthCredentials: vi.fn<UsersPorts["listMcpOAuthCredentials"]>(
    async () => []
  ),
  listOrganizations: vi.fn<UsersPorts["listOrganizations"]>(async () => [
    organization,
  ]),
  listSessions: vi.fn<UsersPorts["listSessions"]>(async () => []),
  resolveActiveOrganization: vi.fn<UsersPorts["resolveActiveOrganization"]>(
    async () => "org_1"
  ),
  revokeMcpOAuthCredential: vi.fn<UsersPorts["revokeMcpOAuthCredential"]>(
    async () => true
  ),
  updateUser: vi.fn<UsersPorts["updateUser"]>(async () => null),
  ...overrides,
})

describe("users serviceのMCP OAuth credential projection", () => {
  it("token値を公開せず現在のorganization membershipをjoinする", async () => {
    const createdAt = new Date("2026-08-12T00:00:00.000Z")
    const ports = createPorts({
      listMcpOAuthCredentials: vi.fn<UsersPorts["listMcpOAuthCredentials"]>(
        async () => [
          {
            clientName: "Codex",
            createdAt,
            credentialId: "r_refresh_1",
            expiresAt: new Date("2026-09-12T00:00:00.000Z"),
            organizationId: "org_1",
            refreshable: true,
            scopes: ["issues:read", "issues:update"],
          },
          {
            clientName: "Removed org client",
            createdAt,
            credentialId: "a_access_1",
            expiresAt: null,
            organizationId: "org_removed",
            refreshable: false,
            scopes: ["files:read"],
          },
        ]
      ),
    })
    const service = createUsersService(ports)

    await expect(
      service.listMcpOAuthCredentials({ userId: "user_1" })
    ).resolves.toEqual([
      {
        clientName: "Codex",
        createdAt: "2026-08-12T00:00:00.000Z",
        credentialId: "r_refresh_1",
        expiresAt: "2026-09-12T00:00:00.000Z",
        organization,
        refreshable: true,
        scopes: ["issues:read", "issues:update"],
      },
      {
        clientName: "Removed org client",
        createdAt: "2026-08-12T00:00:00.000Z",
        credentialId: "a_access_1",
        expiresAt: null,
        organization: null,
        refreshable: false,
        scopes: ["files:read"],
      },
    ])
  })

  it("欠落credentialを既存not-found契約へ写像する", async () => {
    const service = createUsersService(
      createPorts({
        revokeMcpOAuthCredential: vi.fn<UsersPorts["revokeMcpOAuthCredential"]>(
          async () => false
        ),
      })
    )

    await expect(
      service.revokeMcpOAuthCredential({
        credentialId: "r_missing",
        userId: "user_1",
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })
})
