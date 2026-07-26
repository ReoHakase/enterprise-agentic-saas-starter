import type { DeviceAccount, Me, UserProfile, UserSession } from "../schema"

export const fictionalAccountUser = {
  id: "user_01K1AVERY00000000000000",
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
} satisfies UserProfile

export const fictionalDeviceAccounts = [
  {
    session: { token: "session_current_story" },
    user: fictionalAccountUser,
  },
  {
    session: { token: "session_jordan_story" },
    user: {
      id: "user_01K1JORDAN0000000000000",
      name: "Jordan Lee",
      email: "jordan@example.test",
      profileImage: null,
    },
  },
] satisfies DeviceAccount[]

export const fictionalSessions = [
  {
    id: "session_01K1CURRENT000000000000",
    current: true,
    createdAt: "2026-07-20T09:00:00.000Z",
    updatedAt: "2026-07-26T06:00:00.000Z",
    expiresAt: "2026-08-26T06:00:00.000Z",
    ipAddress: "192.0.2.10",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
  },
  {
    id: "session_01K1MOBILE0000000000000",
    current: false,
    createdAt: "2026-07-22T10:30:00.000Z",
    updatedAt: "2026-07-25T23:10:00.000Z",
    expiresAt: "2026-08-25T23:10:00.000Z",
    ipAddress: "198.51.100.24",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  },
] satisfies UserSession[]

export const fictionalMe = {
  user: fictionalAccountUser,
  activeOrganizationId: "org_01K1ACMECLOUD0000000000",
  organizations: [
    {
      id: "org_01K1ACMECLOUD0000000000",
      name: "Acme Cloud",
      slug: "acme",
      role: "super_admin",
      active: true,
      profileImage: null,
      memberCount: 8,
      memberProfileImages: [],
      permissions: {
        canEditOrganization: true,
        canInviteMembers: true,
        canManageMembers: true,
        canManageAdmins: true,
        canTransferSuperAdmin: true,
      },
    },
  ],
} satisfies Me
