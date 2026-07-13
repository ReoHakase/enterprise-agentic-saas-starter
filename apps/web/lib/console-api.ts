export type OrganizationRole = "super_admin" | "admin" | "member"

export type OrganizationPermissions = {
  canEditOrganization: boolean
  canInviteMembers: boolean
  canManageMembers: boolean
  canManageAdmins: boolean
  canTransferSuperAdmin: boolean
}

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  active: boolean
  memberCount: number
  memberAvatars: Array<{
    userId: string
    name: string
    image: string | null
  }>
  permissions: OrganizationPermissions
}

export type OrganizationDetail = OrganizationSummary & {
  logo: string | null
  createdAt: string
  invitationCount: number
}

export type UserProfile = {
  id: string
  name: string
  email: string
  image: string | null
}

export type Me = {
  user: UserProfile
  activeOrganizationId: string | null
  organizations: OrganizationSummary[]
}

export type UserSession = {
  id: string
  current: boolean
  expiresAt: string
  createdAt: string
  updatedAt: string
  ipAddress: string | null
  userAgent: string | null
}

export type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  role: OrganizationRole
  createdAt: string
}

export type OrganizationInvitation = {
  id: string
  email: string
  role: OrganizationRole
  status: string
  organizationId: string
  inviterId: string
  expiresAt: string
  createdAt: string
}

type ConsoleApiOptions = {
  baseUrl: string
  cookie?: string
}

type RequestOptions = {
  method?: string
  body?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isErrorContextValue = (
  value: unknown
): value is string | number | boolean | null | undefined =>
  value === null ||
  value === undefined ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"

const getErrorContext = (
  value: unknown
): ConsoleApiErrorContext | undefined => {
  if (!isRecord(value)) {
    return undefined
  }

  const context: ConsoleApiErrorContext = {}
  for (const [key, contextValue] of Object.entries(value)) {
    if (isErrorContextValue(contextValue)) {
      context[key] = contextValue
    }
  }
  return context
}

const getErrorPayload = (value: unknown) => {
  if (!isRecord(value) || !isRecord(value.error)) {
    return {}
  }

  const { code, context, message } = value.error
  return {
    code: typeof code === "string" ? code : undefined,
    context: getErrorContext(context),
    message: typeof message === "string" ? message : undefined,
  }
}

export type ConsoleApiErrorContext = Record<
  string,
  string | number | boolean | null | undefined
>

export class ConsoleApiError extends Error {
  readonly code: string
  readonly context: ConsoleApiErrorContext
  readonly status: number

  constructor({
    code,
    context,
    message,
    status,
  }: {
    code: string
    context?: ConsoleApiErrorContext
    message: string
    status: number
  }) {
    super(message)
    this.name = "ConsoleApiError"
    this.code = code
    this.context = context ?? {}
    this.status = status
  }
}

export const isStepUpRequiredError = (
  error: unknown
): error is ConsoleApiError =>
  error instanceof ConsoleApiError && error.code === "step_up_required"

export const roleLabel = (role: OrganizationRole) => {
  if (role === "super_admin") {
    return "Super Admin"
  }

  if (role === "admin") {
    return "Admin"
  }

  return "Member"
}

export const createConsoleApi = ({ baseUrl, cookie }: ConsoleApiOptions) => {
  const request = async <T>(path: string, options: RequestOptions = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(cookie ? { cookie } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "include",
    })

    if (!response.ok) {
      const payload = getErrorPayload(await response.json().catch(() => null))
      throw new ConsoleApiError({
        code: payload.code ?? "request_failed",
        context: payload.context,
        message: payload.message ?? "Request failed",
        status: response.status,
      })
    }

    const payload: T = await response.json()
    return payload
  }

  return {
    getMe: () => request<Me>("/me"),
    updateMe: (body: { name: string }) =>
      request<UserProfile>("/me", { method: "PATCH", body }),
    listSessions: () => request<UserSession[]>("/me/sessions"),
    revokeSession: (sessionId: string) =>
      request<{ id: string }>(`/me/sessions/${sessionId}`, {
        method: "DELETE",
      }),
    revokeOtherSessions: () =>
      request<{ revoked: number }>("/me/sessions", { method: "DELETE" }),
    listOrganizations: () => request<OrganizationSummary[]>("/organizations"),
    createOrganization: (body: {
      name: string
      slug: string
      keepCurrentActiveOrganization?: boolean
    }) =>
      request<OrganizationDetail>("/organizations", { method: "POST", body }),
    activateOrganization: (organizationId: string) =>
      request<{ activeOrganizationId: string }>(
        `/organizations/${organizationId}/activate`,
        { method: "POST" }
      ),
    getOrganization: (organizationId: string) =>
      request<OrganizationDetail>(`/organizations/${organizationId}`),
    updateOrganization: (
      organizationId: string,
      body: { name?: string; slug?: string }
    ) =>
      request<OrganizationDetail>(`/organizations/${organizationId}`, {
        method: "PATCH",
        body,
      }),
    listMembers: (organizationId: string) =>
      request<OrganizationMember[]>(`/organizations/${organizationId}/members`),
    updateMemberRole: (
      organizationId: string,
      memberId: string,
      role: Exclude<OrganizationRole, "super_admin">
    ) =>
      request<OrganizationMember[]>(
        `/organizations/${organizationId}/members/${memberId}`,
        { method: "PATCH", body: { role } }
      ),
    transferSuperAdmin: (
      organizationId: string,
      body: { memberId: string; confirmation: string }
    ) =>
      request<OrganizationMember[]>(
        `/organizations/${organizationId}/ownership-transfer`,
        { method: "POST", body }
      ),
    removeMember: (
      organizationId: string,
      memberId: string,
      confirmation: string
    ) =>
      request<{ id: string }>(
        `/organizations/${organizationId}/members/${memberId}`,
        { method: "DELETE", body: { confirmation } }
      ),
    listInvitations: (organizationId: string) =>
      request<OrganizationInvitation[]>(
        `/organizations/${organizationId}/invitations`
      ),
    createInvitation: (
      organizationId: string,
      body: { email: string; role: Exclude<OrganizationRole, "super_admin"> }
    ) =>
      request<OrganizationInvitation>(
        `/organizations/${organizationId}/invitations`,
        { method: "POST", body }
      ),
    cancelInvitation: (organizationId: string, invitationId: string) =>
      request<{ id: string; status: string }>(
        `/organizations/${organizationId}/invitations/${invitationId}`,
        { method: "DELETE" }
      ),
  }
}
