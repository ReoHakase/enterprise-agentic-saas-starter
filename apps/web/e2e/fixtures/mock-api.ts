type OrganizationRole = "super_admin" | "admin" | "member"
type IssueStatus = "open" | "in_progress" | "closed"
type IssuePriority = "no_priority" | "low" | "medium" | "high" | "urgent"

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
  status: IssueStatus
  priority: IssuePriority
  assigneeId: string | null
  creatorId: string
  labels: string[]
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

type IssueComment = {
  id: string
  organizationId: string
  todoId: string
  authorId: string
  author: {
    id: string
    name: string
    image: string | null
  }
  body: string
  createdAt: string
  updatedAt: string
}

type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  role: OrganizationRole
  createdAt: string
}

type OrganizationInvitation = {
  id: string
  email: string
  role: Exclude<OrganizationRole, "super_admin">
  status: string
  organizationId: string
  inviterId: string
  expiresAt: string
  createdAt: string
}

type OrganizationDeletionReceipt = {
  deletionId: string
  organizationId: string
  status: "deleted"
}

type UserSession = {
  id: string
  current: boolean
  expiresAt: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  userAgent: string | null
}

type UserIdentity = {
  id: string
  name: string
  email: string
  image: string | null
}

type SessionState = {
  user: UserIdentity
  organizations: Organization[]
  issues: Issue[]
  commentsByIssue: Map<string, IssueComment[]>
  membersByOrganization: Map<string, OrganizationMember[]>
  invitationsByOrganization: Map<string, OrganizationInvitation[]>
  deletionReceiptsByIdempotencyKey: Map<string, OrganizationDeletionReceipt>
  sessions: UserSession[]
  nextCommentId: number
  nextDeletionId: number
  nextInvitationId: number
  nextIssueId: number
}

type FaultRule = {
  path: string
  method: string
  status: number
  code: string
  message: string
  requestId?: string
  remaining: number
}

type RequestDelay = {
  path: string
  method: string
  delayMs: number
}

const FIXED_NOW = "2026-07-14T09:00:00.000Z"
const FIXED_DUE_DATE = "2026-07-21"
const FIXED_EXPIRES_AT = "2026-08-14T09:00:00.000Z"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const recordFromJson = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {}

const readBody = async (request: Request) =>
  recordFromJson(await request.json().catch(() => null))

const nonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

const isInvitationRole = (
  value: unknown
): value is Exclude<OrganizationRole, "super_admin"> =>
  value === "admin" || value === "member"

const normalizeInvitationEmails = (value: unknown) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    return null
  }

  const emails: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== "string") return null
    const email = entry.trim().toLowerCase()
    if (
      email.length < 1 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ) {
      return null
    }
    if (!seen.has(email)) {
      seen.add(email)
      emails.push(email)
    }
  }

  return emails.length > 0 ? emails : null
}

const isIssueStatus = (value: unknown): value is IssueStatus =>
  value === "open" || value === "in_progress" || value === "closed"

const isIssuePriority = (value: unknown): value is IssuePriority =>
  value === "no_priority" ||
  value === "low" ||
  value === "medium" ||
  value === "high" ||
  value === "urgent"

const isOrganizationDeletionIdempotencyKey = (
  value: unknown
): value is string =>
  typeof value === "string" &&
  value.length >= 16 &&
  value.length <= 128 &&
  /^[A-Za-z0-9._:-]+$/.test(value)

const states = new Map<string, SessionState>()
const faults: FaultRule[] = []
const requestDelays: RequestDelay[] = []

const MAX_E2E_DELAY_MS = 5_000

const permissionsFor = (role: OrganizationRole) => ({
  canEditOrganization: role === "super_admin",
  canInviteMembers: role !== "member",
  canManageMembers: role !== "member",
  canManageAdmins: role === "super_admin",
  canTransferSuperAdmin: role === "super_admin",
})

const identityFor = (sessionKey: string): UserIdentity => {
  if (sessionKey === "new-user") {
    return {
      id: "user-new-user",
      name: "New User",
      email: "new-user@example.com",
      image: null,
    }
  }

  return {
    id: "user-admin",
    name: "Admin User",
    email: "admin@example.com",
    image: null,
  }
}

const sessionIdFor = (sessionKey: string) => `session-${sessionKey}-current`
const deviceSessionTokenFor = (sessionKey: "admin" | "new-user") =>
  `device-session-${sessionKey}`

const sessionKeyFromDeviceToken = (value: unknown) => {
  if (value === deviceSessionTokenFor("admin")) return "admin" as const
  if (value === deviceSessionTokenFor("new-user")) return "new-user" as const
  return null
}

const deviceAccountFor = (sessionKey: "admin" | "new-user") => {
  const user = identityFor(sessionKey)
  return {
    session: {
      id: sessionIdFor(sessionKey),
      token: deviceSessionTokenFor(sessionKey),
      userId: user.id,
      expiresAt: FIXED_EXPIRES_AT,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    },
    user,
  }
}

const createState = (sessionKey: string): SessionState => {
  const user = identityFor(sessionKey)
  const sessions: UserSession[] = [
    {
      id: sessionIdFor(sessionKey),
      current: true,
      expiresAt: FIXED_EXPIRES_AT,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
      ipAddress: "127.0.0.1",
      userAgent: "Chrome on macOS",
    },
    {
      id: `session-${sessionKey}-other`,
      current: false,
      expiresAt: FIXED_EXPIRES_AT,
      createdAt: "2026-07-10T09:00:00.000Z",
      updatedAt: "2026-07-13T09:00:00.000Z",
      ipAddress: "192.0.2.10",
      userAgent: "Safari on iPhone",
    },
  ]

  if (sessionKey === "new-user") {
    return {
      user,
      organizations: [],
      issues: [],
      commentsByIssue: new Map(),
      membersByOrganization: new Map(),
      invitationsByOrganization: new Map(),
      deletionReceiptsByIdempotencyKey: new Map(),
      sessions,
      nextCommentId: 1,
      nextDeletionId: 1,
      nextInvitationId: 1,
      nextIssueId: 1,
    }
  }

  const organizations: Organization[] = [
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
  ]
  if (sessionKey === "unselected") {
    organizations.forEach((organization) => {
      organization.active = false
    })
  }

  return {
    user,
    organizations,
    issues: [
      {
        id: "issue-a-1",
        organizationId: "org-a",
        number: 1,
        title: "Review tenant audit log",
        description: "Confirm tenant isolation.",
        status: "open",
        priority: "high",
        assigneeId: null,
        creatorId: user.id,
        labels: ["security"],
        dueDate: FIXED_DUE_DATE,
        createdAt: "2026-07-12T09:00:00.000Z",
        updatedAt: FIXED_NOW,
      },
      {
        id: "issue-b-1",
        organizationId: "org-b",
        number: 1,
        title: "Private Beta issue",
        description: "Must not appear in Alpha.",
        status: "open",
        priority: "no_priority",
        assigneeId: null,
        creatorId: user.id,
        labels: [],
        dueDate: null,
        createdAt: "2026-07-11T09:00:00.000Z",
        updatedAt: FIXED_NOW,
      },
    ],
    commentsByIssue: new Map([
      [
        "issue-a-1",
        [
          {
            id: "comment-a-1",
            organizationId: "org-a",
            todoId: "issue-a-1",
            authorId: user.id,
            author: user,
            body: "Tenant boundary verified in the API integration suite.",
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          },
        ],
      ],
    ]),
    membersByOrganization: new Map([
      [
        "org-a",
        [
          {
            id: "member-admin",
            userId: user.id,
            name: user.name,
            email: user.email,
            image: null,
            role: "super_admin",
            createdAt: "2026-07-01T09:00:00.000Z",
          },
          {
            id: "member-jordan",
            userId: "user-jordan",
            name: "Jordan Lee",
            email: "jordan@example.com",
            image: null,
            role: "admin",
            createdAt: "2026-07-02T09:00:00.000Z",
          },
          {
            id: "member-kai",
            userId: "user-kai",
            name: "Kai Brooks",
            email: "kai@example.com",
            image: null,
            role: "member",
            createdAt: "2026-07-03T09:00:00.000Z",
          },
        ],
      ],
      [
        "org-b",
        [
          {
            id: "member-beta-lead",
            userId: "user-beta-lead",
            name: "Beta Lead",
            email: "lead@beta.example.com",
            image: null,
            role: "super_admin",
            createdAt: "2026-07-01T09:00:00.000Z",
          },
          {
            id: "member-admin-beta",
            userId: user.id,
            name: user.name,
            email: user.email,
            image: null,
            role: "member",
            createdAt: "2026-07-05T09:00:00.000Z",
          },
        ],
      ],
    ]),
    invitationsByOrganization: new Map([
      [
        "org-a",
        [
          {
            id: "invitation-a-1",
            email: "pending@example.com",
            role: "member",
            status: "pending",
            organizationId: "org-a",
            inviterId: user.id,
            expiresAt: FIXED_EXPIRES_AT,
            createdAt: FIXED_NOW,
          },
        ],
      ],
    ]),
    deletionReceiptsByIdempotencyKey: new Map(),
    sessions,
    nextCommentId: 2,
    nextDeletionId: 1,
    nextInvitationId: 2,
    nextIssueId: 2,
  }
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
  vary: "Origin",
}

const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {}
) => Response.json(value, { status, headers: { ...corsHeaders, ...headers } })

const apiError = (
  code: string,
  message: string,
  status: number,
  {
    context,
    fieldErrors,
    requestId = "req_e2e_default",
  }: {
    context?: Record<string, unknown>
    fieldErrors?: Record<string, string[]>
    requestId?: string
  } = {}
) =>
  json(
    {
      error: {
        code,
        message,
        ...(context ? { context } : {}),
        ...(fieldErrors ? { fieldErrors } : {}),
        requestId,
      },
    },
    status
  )

const unauthorized = () =>
  apiError("unauthorized", "Authentication required", 401)

const forbidden = () => apiError("forbidden", "Permission denied", 403)

const invalid = (message: string) => apiError("invalid_request", message, 400)

const notFound = (resource: string) =>
  apiError("not_found", `${resource} was not found`, 404)

const activeOrganizationMismatch = () =>
  apiError(
    "active_organization_mismatch",
    "Switch to this organization before accessing tenant data",
    409
  )

const membersFor = (state: SessionState, organizationId: string) =>
  state.membersByOrganization.get(organizationId) ?? []

const invitationsFor = (state: SessionState, organizationId: string) =>
  state.invitationsByOrganization.get(organizationId) ?? []

const organizationPayload = (
  state: SessionState,
  organization: Organization
) => {
  const members = membersFor(state, organization.id)

  return {
    ...organization,
    logo: null,
    createdAt: "2026-07-01T09:00:00.000Z",
    invitationCount: invitationsFor(state, organization.id).filter(
      ({ status }) => status === "pending"
    ).length,
    memberCount: members.length,
    memberAvatars: members.slice(0, 3).map((member) => ({
      userId: member.userId,
      name: member.name,
      image: member.image,
    })),
    permissions: permissionsFor(organization.role),
  }
}

const getOrganization = (state: SessionState, organizationId: string) =>
  state.organizations.find(({ id }) => id === organizationId)

type OrganizationAccessResult =
  | { organization: Organization }
  | { response: Response }

const resolveOrganization = (
  state: SessionState,
  organizationId: string | null,
  options: { requireActive?: boolean } = {}
): OrganizationAccessResult => {
  if (!organizationId) {
    return { response: invalid("organizationId is required") }
  }

  const organization = getOrganization(state, organizationId)
  if (!organization) {
    return { response: notFound("Organization") }
  }
  if (options.requireActive !== false && !organization.active) {
    return { response: activeOrganizationMismatch() }
  }

  return { organization }
}

const findIssue = (
  state: SessionState,
  issueId: string,
  organizationId: string
) =>
  state.issues.find(
    (issue) => issue.id === issueId && issue.organizationId === organizationId
  )

const consumeFault = (pathname: string, method: string) => {
  const index = faults.findIndex(
    (fault) =>
      fault.path === pathname && fault.method === method && fault.remaining > 0
  )
  const fault = faults[index]
  if (!fault) {
    return null
  }

  fault.remaining -= 1
  if (fault.remaining === 0) {
    faults.splice(index, 1)
  }

  return apiError(fault.code, fault.message, fault.status, {
    requestId: fault.requestId,
  })
}

const consumeRequestDelay = async (pathname: string, method: string) => {
  const index = requestDelays.findIndex(
    (delay) => delay.path === pathname && delay.method === method
  )
  const delay = requestDelays[index]
  if (!delay) {
    return
  }

  requestDelays.splice(index, 1)
  await Bun.sleep(delay.delayMs)
}

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
      faults.splice(0)
      requestDelays.splice(0)
      return json({ reset: true })
    }
    if (pathname === "/__e2e/request-delays" && request.method === "GET") {
      return json(requestDelays)
    }
    if (pathname === "/__e2e/request-delays" && request.method === "POST") {
      const body = await readBody(request)
      const path = nonEmptyString(body.path)
      const method = nonEmptyString(body.method)?.toUpperCase()
      const delayMs =
        typeof body.delayMs === "number" && Number.isInteger(body.delayMs)
          ? body.delayMs
          : null

      if (
        !path?.startsWith("/") ||
        path.startsWith("/__e2e/") ||
        !method ||
        !delayMs ||
        delayMs < 1 ||
        delayMs > MAX_E2E_DELAY_MS
      ) {
        return invalid(
          `path, method and delayMs between 1 and ${MAX_E2E_DELAY_MS} are required`
        )
      }

      const delay = { path, method, delayMs }
      requestDelays.push(delay)
      return json(delay, 201)
    }
    if (pathname === "/__e2e/faults" && request.method === "GET") {
      return json(faults)
    }
    if (pathname === "/__e2e/faults" && request.method === "POST") {
      const body = await readBody(request)
      const path = nonEmptyString(body.path)
      const method = nonEmptyString(body.method)?.toUpperCase()
      const status =
        typeof body.status === "number" && Number.isInteger(body.status)
          ? body.status
          : null

      if (!path?.startsWith("/") || !method || !status) {
        return invalid("path, method and integer status are required")
      }

      const fault: FaultRule = {
        path,
        method,
        status,
        code: nonEmptyString(body.code) ?? "e2e_fault",
        message: nonEmptyString(body.message) ?? "Injected E2E failure",
        requestId: nonEmptyString(body.requestId) ?? undefined,
        remaining:
          typeof body.remaining === "number" &&
          Number.isInteger(body.remaining) &&
          body.remaining > 0
            ? body.remaining
            : 1,
      }
      faults.push(fault)
      return json(fault, 201)
    }

    await consumeRequestDelay(pathname, request.method)

    const faultResponse = consumeFault(pathname, request.method)
    if (faultResponse) return faultResponse

    if (pathname === "/auth/sign-in/magic-link" && request.method === "POST") {
      return json({ status: true })
    }

    const sessionKey = sessionKeyFor(request)
    if (pathname === "/auth/get-session") {
      if (!sessionKey) return json(null)
      const identity = identityFor(sessionKey)
      return json({
        session: {
          id: sessionIdFor(sessionKey),
          userId: identity.id,
          expiresAt: FIXED_EXPIRES_AT,
        },
        user: identity,
      })
    }
    if (!sessionKey) return unauthorized()

    if (
      pathname === "/auth/multi-session/list-device-sessions" &&
      request.method === "GET"
    ) {
      return json([deviceAccountFor("admin"), deviceAccountFor("new-user")])
    }
    if (
      pathname === "/auth/multi-session/set-active" &&
      request.method === "POST"
    ) {
      const body = await readBody(request)
      const nextSessionKey = sessionKeyFromDeviceToken(body.sessionToken)
      if (!nextSessionKey) return unauthorized()

      return json(deviceAccountFor(nextSessionKey), 200, {
        "set-cookie": `e2e-session=${nextSessionKey}; Path=/; HttpOnly; SameSite=Lax`,
      })
    }
    if (
      pathname === "/auth/multi-session/revoke" &&
      request.method === "POST"
    ) {
      const body = await readBody(request)
      if (!sessionKeyFromDeviceToken(body.sessionToken)) return unauthorized()
      return json({ status: true })
    }
    if (pathname === "/auth/list-accounts" && request.method === "GET") {
      return json([])
    }
    if (
      pathname === "/auth/passkey/list-user-passkeys" &&
      request.method === "GET"
    ) {
      return json([])
    }
    if (
      pathname === "/auth/passkey/generate-register-options" &&
      request.method === "GET"
    ) {
      return json(
        {
          code: "SESSION_NOT_FRESH",
          message: "private session timestamp must never be rendered",
        },
        403
      )
    }

    const state = stateFor(sessionKey)
    const activeOrganization =
      state.organizations.find((organization) => organization.active) ?? null

    if (pathname === "/me" && request.method === "GET") {
      return json({
        user: state.user,
        activeOrganizationId: activeOrganization?.id ?? null,
        organizations: state.organizations.map((organization) =>
          organizationPayload(state, organization)
        ),
      })
    }
    if (pathname === "/me" && request.method === "PATCH") {
      const body = await readBody(request)
      const name = nonEmptyString(body.name)
      if (!name) return invalid("name is required")
      state.user.name = name
      return json(state.user)
    }

    if (pathname === "/me/sessions" && request.method === "GET") {
      return json(state.sessions)
    }
    if (pathname === "/me/sessions" && request.method === "DELETE") {
      const revoked = state.sessions.filter(({ current }) => !current).length
      state.sessions = state.sessions.filter(({ current }) => current)
      return json({ revoked })
    }
    const sessionMatch = pathname.match(/^\/me\/sessions\/([^/]+)$/)
    if (sessionMatch?.[1] && request.method === "DELETE") {
      const sessionIndex = state.sessions.findIndex(
        ({ id }) => id === sessionMatch[1]
      )
      const session = state.sessions[sessionIndex]
      if (!session) return notFound("Session")
      if (session.current)
        return invalid("The current session cannot be revoked")
      state.sessions.splice(sessionIndex, 1)
      return json({ id: session.id })
    }

    if (pathname === "/organizations" && request.method === "GET") {
      return json(
        state.organizations.map((organization) =>
          organizationPayload(state, organization)
        )
      )
    }
    if (pathname === "/organizations" && request.method === "POST") {
      const body = await readBody(request)
      const name = nonEmptyString(body.name)
      const slug = nonEmptyString(body.slug)
      if (!name || !slug) return invalid("name and slug are required")
      if (
        state.organizations.some((organization) => organization.slug === slug)
      ) {
        return apiError("conflict", "Organization slug already exists", 409)
      }

      if (body.keepCurrentActiveOrganization !== true) {
        state.organizations.forEach((organization) => {
          organization.active = false
        })
      }
      const organization: Organization = {
        id: `org-${slug}`,
        name,
        slug,
        role: "super_admin",
        active: body.keepCurrentActiveOrganization !== true,
      }
      state.organizations.push(organization)
      state.membersByOrganization.set(organization.id, [
        {
          id: `member-${state.user.id}-${organization.id}`,
          userId: state.user.id,
          name: state.user.name,
          email: state.user.email,
          image: state.user.image,
          role: "super_admin",
          createdAt: FIXED_NOW,
        },
      ])
      state.invitationsByOrganization.set(organization.id, [])
      return json(organizationPayload(state, organization), 201)
    }

    const activateMatch = pathname.match(/^\/organizations\/([^/]+)\/activate$/)
    if (activateMatch?.[1] && request.method === "POST") {
      const access = resolveOrganization(state, activateMatch[1], {
        requireActive: false,
      })
      if ("response" in access) return access.response
      const { organization } = access
      state.organizations.forEach((candidate) => {
        candidate.active = candidate.id === organization.id
      })
      return json({ activeOrganizationId: organization.id })
    }

    const memberCollectionMatch = pathname.match(
      /^\/organizations\/([^/]+)\/members$/
    )
    if (memberCollectionMatch?.[1] && request.method === "GET") {
      const access = resolveOrganization(state, memberCollectionMatch[1])
      if ("response" in access) return access.response
      return json(membersFor(state, access.organization.id))
    }

    const memberMatch = pathname.match(
      /^\/organizations\/([^/]+)\/members\/([^/]+)$/
    )
    if (memberMatch?.[1] && memberMatch[2]) {
      const access = resolveOrganization(state, memberMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (!permissionsFor(organization.role).canManageMembers) {
        return forbidden()
      }
      const members = membersFor(state, organization.id)
      const memberIndex = members.findIndex(({ id }) => id === memberMatch[2])
      const member = members[memberIndex]
      if (!member) return notFound("Member")

      if (request.method === "PATCH") {
        if (!permissionsFor(organization.role).canManageAdmins)
          return forbidden()
        const body = await readBody(request)
        if (!isInvitationRole(body.role)) return invalid("role is invalid")
        member.role = body.role
        return json(members)
      }
      if (request.method === "DELETE") {
        const body = await readBody(request)
        if (body.confirmation !== member.email) {
          return invalid("confirmation must match the member email")
        }
        if (member.role === "super_admin") return forbidden()
        members.splice(memberIndex, 1)
        return json({ id: member.id })
      }
    }

    const ownershipMatch = pathname.match(
      /^\/organizations\/([^/]+)\/ownership-transfer$/
    )
    if (ownershipMatch?.[1] && request.method === "POST") {
      const access = resolveOrganization(state, ownershipMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (organization.role !== "super_admin") return forbidden()
      const body = await readBody(request)
      const memberId = nonEmptyString(body.memberId)
      const members = membersFor(state, organization.id)
      const target = members.find(({ id }) => id === memberId)
      if (!target) return notFound("Member")
      if (body.confirmation !== target.email) {
        return invalid("confirmation must match the member email")
      }
      members.forEach((member) => {
        if (member.role === "super_admin") member.role = "admin"
      })
      target.role = "super_admin"
      return json(members)
    }

    const invitationCollectionMatch = pathname.match(
      /^\/organizations\/([^/]+)\/invitations$/
    )
    if (invitationCollectionMatch?.[1]) {
      const access = resolveOrganization(state, invitationCollectionMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (!permissionsFor(organization.role).canInviteMembers) {
        return forbidden()
      }
      const invitations = invitationsFor(state, organization.id)
      if (request.method === "GET") return json(invitations)
      if (request.method === "POST") {
        const body = await readBody(request)
        const emails = normalizeInvitationEmails(body.emails)
        const role = body.role
        if (!emails || !isInvitationRole(role)) {
          return invalid("emails and role are required")
        }
        if (role === "admin" && organization.role !== "super_admin") {
          return forbidden()
        }

        const members = membersFor(state, organization.id)
        const hasExistingMember = emails.some((email) =>
          members.some((member) => member.email.toLowerCase() === email)
        )
        const hasPendingInvitation = emails.some((email) =>
          invitations.some(
            (invitation) =>
              invitation.status === "pending" &&
              invitation.email.toLowerCase() === email
          )
        )
        if (hasExistingMember || hasPendingInvitation) {
          return apiError(
            "conflict",
            hasExistingMember
              ? "One or more emails already belong to members"
              : "One or more emails already have pending invitations",
            409,
            {
              fieldErrors: {
                emails: ["One or more email addresses cannot be invited."],
              },
            }
          )
        }

        const createdInvitations = emails.map(
          (email, index): OrganizationInvitation => ({
            id: `invitation-${sessionKey}-${state.nextInvitationId + index}`,
            email,
            role,
            status: "pending",
            organizationId: organization.id,
            inviterId: state.user.id,
            expiresAt: FIXED_EXPIRES_AT,
            createdAt: FIXED_NOW,
          })
        )
        state.nextInvitationId += createdInvitations.length
        invitations.push(...createdInvitations)
        state.invitationsByOrganization.set(organization.id, invitations)
        return json(
          {
            invitations: createdInvitations,
            queuedCount: createdInvitations.length,
            delivery: "queued",
          },
          201
        )
      }
    }

    const invitationMatch = pathname.match(
      /^\/organizations\/([^/]+)\/invitations\/([^/]+)$/
    )
    if (
      invitationMatch?.[1] &&
      invitationMatch[2] &&
      request.method === "DELETE"
    ) {
      const access = resolveOrganization(state, invitationMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (!permissionsFor(organization.role).canInviteMembers) {
        return forbidden()
      }
      const invitations = invitationsFor(state, organization.id)
      const invitation = invitations.find(({ id }) => id === invitationMatch[2])
      if (!invitation) return notFound("Invitation")
      invitation.status = "cancelled"
      return json({ id: invitation.id, status: invitation.status })
    }

    const organizationMatch = pathname.match(/^\/organizations\/([^/]+)$/)
    if (organizationMatch?.[1]) {
      if (request.method === "DELETE") {
        const organizationId = organizationMatch[1]
        const body = await readBody(request)
        const idempotencyKey = body.idempotencyKey
        if (!isOrganizationDeletionIdempotencyKey(idempotencyKey)) {
          return invalid("idempotencyKey is invalid")
        }
        if (body.confirmation !== "DELETE") {
          return invalid("confirmation must equal DELETE")
        }
        const slug = nonEmptyString(body.slug)
        if (!slug) return invalid("slug is required")

        const replay =
          state.deletionReceiptsByIdempotencyKey.get(idempotencyKey)
        if (replay) {
          return replay.organizationId === organizationId
            ? json(replay)
            : apiError("conflict", "Idempotency key has already been used", 409)
        }

        const access = resolveOrganization(state, organizationId)
        if ("response" in access) return access.response
        const { organization } = access
        if (organization.role !== "super_admin") return forbidden()
        if (slug !== organization.slug) {
          return invalid("slug must match the organization slug")
        }

        const receipt: OrganizationDeletionReceipt = {
          deletionId: `deletion-${sessionKey}-${state.nextDeletionId}`,
          organizationId,
          status: "deleted",
        }
        state.nextDeletionId += 1
        state.deletionReceiptsByIdempotencyKey.set(idempotencyKey, receipt)
        state.organizations = state.organizations.filter(
          ({ id }) => id !== organizationId
        )
        const deletedIssueIds = new Set(
          state.issues
            .filter((issue) => issue.organizationId === organizationId)
            .map(({ id }) => id)
        )
        state.issues = state.issues.filter(
          (issue) => issue.organizationId !== organizationId
        )
        deletedIssueIds.forEach((issueId) => {
          state.commentsByIssue.delete(issueId)
        })
        state.membersByOrganization.delete(organizationId)
        state.invitationsByOrganization.delete(organizationId)
        return json(receipt)
      }

      const access = resolveOrganization(state, organizationMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (request.method === "GET") {
        return json(organizationPayload(state, organization))
      }
      if (request.method === "PATCH") {
        if (!permissionsFor(organization.role).canEditOrganization) {
          return forbidden()
        }
        const body = await readBody(request)
        const name = body.name === undefined ? null : nonEmptyString(body.name)
        const slug = body.slug === undefined ? null : nonEmptyString(body.slug)
        if (body.name !== undefined && !name) return invalid("name is invalid")
        if (body.slug !== undefined && !slug) return invalid("slug is invalid")
        if (name) organization.name = name
        if (slug) organization.slug = slug
        return json(organizationPayload(state, organization))
      }
    }

    if (
      (pathname === "/auth/organization/accept-invitation" ||
        pathname === "/auth/organization/reject-invitation") &&
      request.method === "POST"
    ) {
      const status = pathname.includes("accept") ? "accepted" : "rejected"
      return json({ status })
    }

    const commentMatch = pathname.match(/^\/todos\/([^/]+)\/comments\/([^/]+)$/)
    if (commentMatch?.[1] && commentMatch[2]) {
      const body = await readBody(request)
      const organizationId = nonEmptyString(body.organizationId)
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const verifiedOrganizationId = access.organization.id
      const issue = findIssue(state, commentMatch[1], verifiedOrganizationId)
      if (!issue) return notFound("Issue")
      const comments = state.commentsByIssue.get(issue.id) ?? []
      const commentIndex = comments.findIndex(
        ({ id }) => id === commentMatch[2]
      )
      const comment = comments[commentIndex]
      if (!comment) return notFound("Comment")

      if (request.method === "PATCH") {
        const nextBody = nonEmptyString(body.body)
        if (!nextBody) return invalid("body is required")
        comment.body = nextBody
        comment.updatedAt = FIXED_NOW
        return json(comment)
      }
      if (request.method === "DELETE") {
        comments.splice(commentIndex, 1)
        return json(comment)
      }
    }

    const commentCollectionMatch = pathname.match(
      /^\/todos\/([^/]+)\/comments$/
    )
    if (commentCollectionMatch?.[1]) {
      const body = request.method === "GET" ? {} : await readBody(request)
      const organizationId =
        request.method === "GET"
          ? url.searchParams.get("organizationId")
          : nonEmptyString(body.organizationId)
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const verifiedOrganizationId = access.organization.id
      const issue = findIssue(
        state,
        commentCollectionMatch[1],
        verifiedOrganizationId
      )
      if (!issue) return notFound("Issue")
      const comments = state.commentsByIssue.get(issue.id) ?? []
      state.commentsByIssue.set(issue.id, comments)

      if (request.method === "GET") return json(comments)
      if (request.method === "POST") {
        const commentBody = nonEmptyString(body.body)
        if (!commentBody) return invalid("body is required")
        const comment: IssueComment = {
          id: `comment-${sessionKey}-${state.nextCommentId}`,
          organizationId: verifiedOrganizationId,
          todoId: issue.id,
          authorId: state.user.id,
          author: state.user,
          body: commentBody,
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        }
        state.nextCommentId += 1
        comments.push(comment)
        return json(comment, 201)
      }
    }

    if (pathname === "/todos" && request.method === "GET") {
      const organizationId = url.searchParams.get("organizationId")
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      return json(
        state.issues.filter(
          (issue) => issue.organizationId === access.organization.id
        )
      )
    }
    if (pathname === "/todos" && request.method === "POST") {
      const body = await readBody(request)
      const organizationId = nonEmptyString(body.organizationId)
      const title = nonEmptyString(body.title)
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const verifiedOrganizationId = access.organization.id
      if (!title) return invalid("title is required")
      const organizationIssues = state.issues.filter(
        (issue) => issue.organizationId === verifiedOrganizationId
      )
      const issue: Issue = {
        id: `issue-${sessionKey}-${state.nextIssueId}`,
        organizationId: verifiedOrganizationId,
        number:
          Math.max(0, ...organizationIssues.map(({ number }) => number)) + 1,
        title,
        description:
          typeof body.description === "string" ? body.description : "",
        status: isIssueStatus(body.status) ? body.status : "open",
        priority: isIssuePriority(body.priority)
          ? body.priority
          : "no_priority",
        assigneeId:
          typeof body.assigneeId === "string" || body.assigneeId === null
            ? body.assigneeId
            : null,
        creatorId: state.user.id,
        labels: Array.isArray(body.labels)
          ? body.labels.filter(
              (label): label is string => typeof label === "string"
            )
          : [],
        dueDate:
          typeof body.dueDate === "string" || body.dueDate === null
            ? body.dueDate
            : null,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      }
      state.nextIssueId += 1
      state.issues.push(issue)
      return json(issue, 201)
    }

    const todoMatch = pathname.match(/^\/todos\/([^/]+)$/)
    if (todoMatch?.[1]) {
      const body = request.method === "GET" ? {} : await readBody(request)
      const organizationId =
        request.method === "GET"
          ? url.searchParams.get("organizationId")
          : nonEmptyString(body.organizationId)
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const verifiedOrganizationId = access.organization.id
      const issueIndex = state.issues.findIndex(
        (issue) =>
          issue.id === todoMatch[1] &&
          issue.organizationId === verifiedOrganizationId
      )
      const issue = state.issues[issueIndex]
      if (!issue) return notFound("Issue")

      if (request.method === "GET") return json(issue)
      if (request.method === "PATCH") {
        if (body.title !== undefined) {
          const title = nonEmptyString(body.title)
          if (!title) return invalid("title is invalid")
          issue.title = title
        }
        if (typeof body.description === "string") {
          issue.description = body.description
        }
        if (isIssueStatus(body.status)) issue.status = body.status
        if (isIssuePriority(body.priority)) issue.priority = body.priority
        if (typeof body.assigneeId === "string" || body.assigneeId === null) {
          issue.assigneeId = body.assigneeId
        }
        if (Array.isArray(body.labels)) {
          issue.labels = body.labels.filter(
            (label): label is string => typeof label === "string"
          )
        }
        if (typeof body.dueDate === "string" || body.dueDate === null) {
          issue.dueDate = body.dueDate
        }
        issue.updatedAt = FIXED_NOW
        return json(issue)
      }
      if (request.method === "DELETE") {
        state.issues.splice(issueIndex, 1)
        state.commentsByIssue.delete(issue.id)
        return json(issue)
      }
    }

    return apiError("not_found", pathname, 404)
  },
})

console.log("E2E mock API listening on http://127.0.0.1:3001")
