type OrganizationRole = "super_admin" | "admin" | "member"

type Organization = {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  active: boolean
}

type Issue = {
  id: string
  organizationId: string
  number: number
  title: string
  description: string
  completed: boolean
  status: "open" | "in_progress" | "closed"
  priority: "no_priority" | "low" | "medium" | "high" | "urgent"
  assigneeId: string | null
  creatorId: string
  labels: string[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

type SessionState = {
  organizations: Organization[]
  issues: Issue[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const recordFromJson = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}

const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

const states = new Map<string, SessionState>()

const permissionsFor = (role: OrganizationRole) => ({
  canEditOrganization: role === "super_admin",
  canInviteMembers: role !== "member",
  canManageMembers: role !== "member",
  canManageAdmins: role === "super_admin",
  canTransferSuperAdmin: role === "super_admin",
})

const createState = (sessionKey: string): SessionState => {
  if (sessionKey === "new-user") {
    return { organizations: [], issues: [] }
  }

  const now = new Date().toISOString()
  const state: SessionState = {
    organizations: [
      {
        id: "org-a",
        name: "Alpha Operations",
        slug: "alpha-operations",
        role: "super_admin",
        active: true,
      },
      {
        id: "org-b",
        name: "Beta Support",
        slug: "beta-support",
        role: "member",
        active: false,
      },
    ],
    issues: [
      {
        id: "issue-a-1",
        organizationId: "org-a",
        number: 1,
        title: "Review tenant audit log",
        description: "Confirm tenant isolation.",
        completed: false,
        status: "open",
        priority: "high",
        assigneeId: null,
        creatorId: "user-admin",
        labels: ["security"],
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "issue-b-1",
        organizationId: "org-b",
        number: 1,
        title: "Private Beta issue",
        description: "Must not appear in Alpha.",
        completed: false,
        status: "open",
        priority: "no_priority",
        assigneeId: null,
        creatorId: "user-admin",
        labels: [],
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
  }
  if (sessionKey === "unselected") {
    state.organizations.forEach((organization) => {
      organization.active = false
    })
  }
  return state
}

const stateFor = (sessionKey: string) => {
  const state = states.get(sessionKey) ?? createState(sessionKey)
  states.set(sessionKey, state)
  return state
}

const sessionKeyFor = (request: Request) => {
  const cookie = request.headers.get("cookie") ?? ""
  return cookie.match(/(?:^|;\s*)e2e-session=([^;]+)/)?.[1] ?? null
}

const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "DELETE,GET,OPTIONS,PATCH,POST",
  "access-control-allow-origin": "http://127.0.0.1:3000",
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: corsHeaders })

const organizationPayload = (organization: Organization) => ({
  ...organization,
  logo: null,
  createdAt: "2026-07-13T00:00:00.000Z",
  invitationCount: 0,
  memberCount: organization.role === "member" ? 3 : 5,
  memberAvatars: [],
  permissions: permissionsFor(organization.role),
})

const unauthorized = () =>
  json(
    { error: { code: "unauthorized", message: "Authentication required" } },
    401
  )

const forbidden = () =>
  json({ error: { code: "forbidden", message: "Permission denied" } }, 403)

Bun.serve({
  port: 3001,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url)
    const { pathname } = url

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (pathname === "/health") return json({ status: "ok" })
    if (pathname === "/__e2e/reset" && request.method === "POST") {
      states.clear()
      return json({ reset: true })
    }
    if (pathname === "/auth/sign-in/magic-link" && request.method === "POST") {
      return json({ status: true })
    }

    const sessionKey = sessionKeyFor(request)
    if (pathname === "/auth/get-session") {
      return json(
        sessionKey
          ? {
              session: {
                id: `session-${sessionKey}`,
                userId: `user-${sessionKey}`,
                expiresAt: "2099-01-01T00:00:00.000Z",
              },
              user: {
                id: `user-${sessionKey}`,
                email: `${sessionKey}@example.com`,
                name: sessionKey === "new-user" ? "New User" : "Admin User",
              },
            }
          : null
      )
    }
    if (!sessionKey) return unauthorized()

    const state = stateFor(sessionKey)
    const activeOrganization =
      state.organizations.find((organization) => organization.active) ?? null

    if (pathname === "/me" && request.method === "GET") {
      return json({
        user: {
          id: `user-${sessionKey}`,
          email: `${sessionKey}@example.com`,
          name: sessionKey === "new-user" ? "New User" : "Admin User",
          image: null,
        },
        activeOrganizationId: activeOrganization?.id ?? null,
        organizations: state.organizations.map(organizationPayload),
      })
    }

    if (pathname === "/organizations" && request.method === "GET") {
      return json(state.organizations.map(organizationPayload))
    }
    if (pathname === "/organizations" && request.method === "POST") {
      const body = recordFromJson(await request.json())
      const input = {
        name: requiredString(body.name, "name"),
        slug: requiredString(body.slug, "slug"),
      }
      state.organizations.forEach((organization) => {
        organization.active = false
      })
      const organization: Organization = {
        id: `org-${input.slug}`,
        name: input.name,
        slug: input.slug,
        role: "super_admin",
        active: true,
      }
      state.organizations.push(organization)
      return json(organizationPayload(organization), 201)
    }

    const organizationMatch = pathname.match(/^\/organizations\/([^/]+)$/)
    if (organizationMatch?.[1] && request.method === "GET") {
      const organization = state.organizations.find(
        ({ id }) => id === organizationMatch[1]
      )
      return organization
        ? json(organizationPayload(organization))
        : forbidden()
    }
    if (organizationMatch?.[1] && request.method === "PATCH") {
      const organization = state.organizations.find(
        ({ id }) => id === organizationMatch[1]
      )
      if (
        !organization ||
        !permissionsFor(organization.role).canEditOrganization
      ) {
        return forbidden()
      }
      return json(organizationPayload(organization))
    }

    const activateMatch = pathname.match(/^\/organizations\/([^/]+)\/activate$/)
    if (activateMatch?.[1] && request.method === "POST") {
      const organization = state.organizations.find(
        ({ id }) => id === activateMatch[1]
      )
      if (!organization) return forbidden()
      state.organizations.forEach((candidate) => {
        candidate.active = candidate.id === organization.id
      })
      return json({ activeOrganizationId: organization.id })
    }

    if (/^\/organizations\/[^/]+\/(members|invitations)$/.test(pathname)) {
      return json([])
    }

    if (pathname === "/todos" && request.method === "GET") {
      const organizationId = url.searchParams.get("organizationId")
      if (
        !organizationId ||
        !state.organizations.some(({ id }) => id === organizationId)
      ) {
        return forbidden()
      }
      return json(
        state.issues.filter((issue) => issue.organizationId === organizationId)
      )
    }
    if (pathname === "/todos" && request.method === "POST") {
      const body = recordFromJson(await request.json())
      const input = {
        organizationId: requiredString(body.organizationId, "organizationId"),
        title: requiredString(body.title, "title"),
      }
      if (!state.organizations.some(({ id }) => id === input.organizationId)) {
        return forbidden()
      }
      const organizationIssues = state.issues.filter(
        ({ organizationId }) => organizationId === input.organizationId
      )
      const now = new Date().toISOString()
      const issue: Issue = {
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        number: organizationIssues.length + 1,
        title: input.title,
        description: "",
        completed: false,
        status: "open",
        priority: "no_priority",
        assigneeId: null,
        creatorId: `user-${sessionKey}`,
        labels: [],
        dueDate: null,
        createdAt: now,
        updatedAt: now,
      }
      state.issues.push(issue)
      return json(issue, 201)
    }

    return json({ error: { code: "not_found", message: pathname } }, 404)
  },
})

console.log("E2E mock API listening on http://127.0.0.1:3001")
