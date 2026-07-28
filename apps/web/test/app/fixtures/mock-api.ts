type OneShotRule = {
  namespace: string
  method: string
  path: string
}

type FaultRule = OneShotRule & {
  code: string
  message: string
  status: number
}

type DelayRule = OneShotRule & {
  delayMs: number
}

const fixedNow = "2026-07-14T09:00:00.000Z"
const expiresAt = "2026-08-14T09:00:00.000Z"
const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-e2e-namespace",
  "access-control-allow-methods": "GET,OPTIONS,POST",
  "access-control-allow-origin": "http://127.0.0.1:3000",
  vary: "Origin",
}

const faultRules: FaultRule[] = []
const delayRules: DelayRule[] = []

const user = {
  id: "user-admin",
  name: "Admin User",
  email: "admin@example.com",
  profileImage: null,
}

const permissions = {
  canEditOrganization: true,
  canInviteMembers: true,
  canManageMembers: true,
  canManageAdmins: true,
  canTransferSuperAdmin: true,
}

const member = {
  id: "member-admin",
  userId: user.id,
  name: user.name,
  email: user.email,
  profileImage: null,
  githubLinked: true,
  passkeyLinked: true,
  role: "super_admin",
  createdAt: "2026-07-01T09:00:00.000Z",
}

const organization = {
  id: "org-a",
  name: "Alpha Operations",
  slug: "alpha-operations",
  role: "super_admin",
  active: true,
  profileImage: null,
  memberCount: 1,
  memberProfileImages: [
    { userId: user.id, name: user.name, profileImage: null },
  ],
  permissions,
}

const organizationDetail = {
  ...organization,
  createdAt: "2026-07-01T09:00:00.000Z",
  invitationCount: 1,
}

const invitation = {
  id: "invitation-new-user",
  email: "new-user@example.com",
  role: "member",
  status: "pending",
  organizationId: organization.id,
  inviterId: user.id,
  inviter: user,
  expiresAt,
  createdAt: "2026-07-13T09:00:00.000Z",
}

const issue = {
  id: "issue-a-1",
  organizationId: organization.id,
  number: 1,
  title: "Review tenant audit log",
  description: "Confirm tenant isolation.",
  status: "open",
  priority: "high",
  assigneeId: null,
  creatorId: user.id,
  labels: ["security"],
  dueDate: "2026-07-21T09:30:00.000Z",
  revision: 1,
  createdAt: "2026-07-12T09:00:00.000Z",
  updatedAt: fixedNow,
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: corsHeaders })

const apiError = (code: string, message: string, status: number) =>
  json({ error: { code, message, requestId: "req_e2e_fixture" } }, status)

const cookieValue = (request: Request, name: string) => {
  const escapedName = name.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = (request.headers.get("cookie") ?? "").match(
    new RegExp(`(?:^|;\\s*)${escapedName}=([^;]+)`)
  )
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

const namespaceFor = (request: Request) =>
  request.headers.get("x-e2e-namespace") ??
  cookieValue(request, "e2e-namespace") ??
  "default"

const removeNamespaceRules = (namespace: string) => {
  for (const rules of [faultRules, delayRules]) {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      if (rules[index]?.namespace === namespace) rules.splice(index, 1)
    }
  }
}

const takeRule = <Rule extends OneShotRule>(
  rules: Rule[],
  namespace: string,
  method: string,
  path: string
) => {
  const index = rules.findIndex(
    (rule) =>
      rule.namespace === namespace &&
      rule.method === method &&
      rule.path === path
  )
  if (index < 0) return undefined
  return rules.splice(index, 1)[0]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseControlBody = async (request: Request) => {
  const body: unknown = await request.json().catch(() => null)
  return isRecord(body) ? body : {}
}

const nonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null

const handleControlRequest = async (
  request: Request,
  url: URL,
  namespace: string
) => {
  if (url.pathname === "/health") return json({ status: "ok" })
  if (url.pathname === "/__e2e/reset" && request.method === "POST") {
    removeNamespaceRules(namespace)
    return json({ reset: true })
  }
  if (url.pathname === "/__e2e/request-delays" && request.method === "GET") {
    return json(delayRules.filter((rule) => rule.namespace === namespace))
  }
  if (url.pathname === "/__e2e/request-delays") {
    const body = await parseControlBody(request)
    const path = nonEmptyString(body.path)
    const method = nonEmptyString(body.method)?.toUpperCase()
    const delayMs =
      typeof body.delayMs === "number" && Number.isInteger(body.delayMs)
        ? body.delayMs
        : 0
    if (!path?.startsWith("/") || !method || delayMs < 1 || delayMs > 5_000) {
      return apiError(
        "invalid_request",
        "path, method and a delay from 1 to 5000ms are required",
        400
      )
    }
    const rule = { namespace, path, method, delayMs }
    delayRules.push(rule)
    return json(rule, 201)
  }
  if (url.pathname === "/__e2e/faults" && request.method === "GET") {
    return json(faultRules.filter((rule) => rule.namespace === namespace))
  }
  if (url.pathname === "/__e2e/faults") {
    const body = await parseControlBody(request)
    const path = nonEmptyString(body.path)
    const method = nonEmptyString(body.method)?.toUpperCase()
    const status =
      typeof body.status === "number" && Number.isInteger(body.status)
        ? body.status
        : 0
    if (!path?.startsWith("/") || !method || status < 400 || status > 599) {
      return apiError(
        "invalid_request",
        "path, method and an error status are required",
        400
      )
    }
    const rule = {
      namespace,
      path,
      method,
      status,
      code: nonEmptyString(body.code) ?? "e2e_fault",
      message: nonEmptyString(body.message) ?? "Injected E2E failure",
    }
    faultRules.push(rule)
    return json(rule, 201)
  }
}

const authSession = (sessionKey: string | null) => {
  if (!sessionKey) return null
  const identity =
    sessionKey === "new-user"
      ? {
          id: "user-new-user",
          name: "New User",
          email: "new-user@example.com",
        }
      : user
  return {
    session: {
      id: `session-${sessionKey}`,
      userId: identity.id,
      expiresAt,
    },
    user: { ...identity, image: null },
  }
}

const handleAuthRequest = (
  request: Request,
  url: URL,
  sessionKey: string | null
) => {
  if (url.pathname === "/auth/get-session") {
    return json(authSession(sessionKey))
  }
  if (url.pathname === "/auth/organization/get-invitation") {
    if (!sessionKey) return apiError("UNAUTHORIZED", "Sign in required", 401)
    if (
      sessionKey !== "new-user" ||
      url.searchParams.get("id") !== invitation.id
    ) {
      return apiError(
        "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
        "Use the account that received this invitation",
        403
      )
    }
    return json({
      id: invitation.id,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      inviterEmail: user.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
  }
  if (url.pathname === "/auth/multi-session/list-device-sessions") {
    return json([])
  }
  if (
    url.pathname === "/auth/list-accounts" ||
    url.pathname === "/auth/passkey/list-user-passkeys"
  ) {
    return json([])
  }
}

const handleConsoleRequest = (url: URL) => {
  if (url.pathname === "/me") {
    return json({
      user,
      activeOrganizationId: organization.id,
      organizations: [organization],
    })
  }
  if (url.pathname === "/me/sessions") {
    return json([
      {
        id: "session-admin",
        current: true,
        expiresAt,
        createdAt: fixedNow,
        updatedAt: fixedNow,
        ipAddress: "127.0.0.1",
        userAgent: null,
      },
    ])
  }
  if (url.pathname === "/organizations") return json([organization])
  if (url.pathname === `/organizations/${organization.id}`) {
    return json(organizationDetail)
  }
  if (url.pathname === `/organizations/${organization.id}/members`) {
    return json([member])
  }
  if (url.pathname === `/organizations/${organization.id}/invitations`) {
    return json([invitation])
  }
}

const handleIssueRequest = (url: URL) => {
  if (url.pathname === "/issues/labels") {
    return json({ items: ["audit", "security"] })
  }
  if (url.pathname === "/issues") {
    return json({
      items: [
        {
          ...issue,
          attachmentCount: 0,
          commentCount: 0,
          thumbnail: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    })
  }
  if (url.pathname === "/issues/by-number/1") return json(issue)
  if (url.pathname === `/issues/${issue.id}/timeline`) {
    return json({
      items: [
        {
          type: "activity",
          id: "activity-a-1",
          kind: "created",
          field: null,
          fromValue: null,
          toValue: null,
          actor: { id: user.id, name: user.name, profileImage: null },
          createdAt: issue.createdAt,
        },
      ],
      nextCursor: null,
    })
  }
  if (url.pathname === `/issues/${issue.id}/thumbnail`) {
    return json({ mode: "automatic", file: null })
  }
  if (
    url.pathname ===
    `/files/organizations/${organization.id}/owners/issue/${issue.id}`
  ) {
    return json({ items: [], nextCursor: null })
  }
}

const handleAgentRequest = (url: URL) => {
  if (url.pathname === "/agent/threads") return json([])
  if (url.pathname === "/agent/usage/monthly") {
    return json({
      month: "2026-07",
      totals: {
        runCount: 0,
        inputTokenCount: 0,
        outputTokenCount: 0,
        reasoningTokenCount: 0,
        totalTokenCount: 0,
        costMicros: 0,
      },
      byModel: [],
    })
  }
}

const handleRequest = async (request: Request) => {
  const url = new URL(request.url)
  const namespace = namespaceFor(request)

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const controlResponse = await handleControlRequest(request, url, namespace)
  if (controlResponse) return controlResponse

  const delayRule = takeRule(
    delayRules,
    namespace,
    request.method,
    url.pathname
  )
  if (delayRule) {
    await Bun.sleep(delayRule.delayMs)
  }
  const faultRule = takeRule(
    faultRules,
    namespace,
    request.method,
    url.pathname
  )
  if (faultRule) {
    return apiError(faultRule.code, faultRule.message, faultRule.status)
  }

  const sessionKey = cookieValue(request, "e2e-session")
  const authResponse = handleAuthRequest(request, url, sessionKey)
  if (authResponse) return authResponse
  if (!sessionKey) {
    return apiError("unauthorized", "Authentication required", 401)
  }

  const response =
    handleConsoleRequest(url) ??
    handleIssueRequest(url) ??
    handleAgentRequest(url)
  return response ?? apiError("not_found", url.pathname, 404)
}

Bun.serve({
  port: 3001,
  hostname: "127.0.0.1",
  fetch: handleRequest,
})

console.log("E2E fixture API listening on http://127.0.0.1:3001")
