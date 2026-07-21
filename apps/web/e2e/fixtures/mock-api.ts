type OrganizationRole = "super_admin" | "admin" | "member"
type IssueStatus = "open" | "in_progress" | "closed"
type IssuePriority = "no_priority" | "low" | "medium" | "high" | "urgent"

type Organization = {
  id: string
  name: string
  slug: string
  role: OrganizationRole
  active: boolean
  profileImage: string | null
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
  issueId: string
  authorId: string
  author: {
    id: string
    name: string
    profileImage: string | null
  }
  body: string
  createdAt: string
  updatedAt: string
}

type IssueActivity = {
  type: "activity"
  id: string
  kind:
    | "created"
    | "field_changed"
    | "legacy_updated"
    | "file_added"
    | "file_deleted"
  field:
    | "title"
    | "description"
    | "status"
    | "priority"
    | "assignee"
    | "labels"
    | "due_date"
    | null
  fromValue: string | string[] | null
  toValue: string | string[] | null
  actor: { id: string | null; name: string; profileImage: string | null }
  createdAt: string
}

type FileAttachment = {
  id: string
  owner: { type: "issue"; id: string }
  filename: string
  sizeBytes: number
  declaredContentType: string
  previewable: boolean
  textPreviewable: boolean
  imageWidth: number | null
  imageHeight: number | null
  uploader: { id: string; name: string; profileImage: string | null }
  createdAt: string
  canDelete: boolean
}

type StoredFileAttachment = FileAttachment & {
  organizationId: string
  uploadId: string
  content: string
}

const PREVIEW_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

type OrganizationMember = {
  id: string
  userId: string
  name: string
  email: string
  profileImage: string | null
  role: OrganizationRole
  createdAt: string
}

type OrganizationInvitation = {
  id: string
  email: string
  role: Exclude<OrganizationRole, "super_admin">
  status: "pending" | "accepted" | "rejected" | "canceled" | "expired"
  organizationId: string
  inviterId: string
  inviter: UserIdentity
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
  profileImage: string | null
}

type StoredProfileImageUpload = {
  content: string
  contentType: string
  dto: {
    id: string
    profileImage: string
    width: 512
    height: 512
    updatedAt: string
  }
  previousProfileImage: string | null
  sizeBytes: number
}

type SessionState = {
  user: UserIdentity
  organizations: Organization[]
  issues: Issue[]
  files: StoredFileAttachment[]
  commentsByIssue: Map<string, IssueComment[]>
  activitiesByIssue: Map<string, IssueActivity[]>
  membersByOrganization: Map<string, OrganizationMember[]>
  invitationsByOrganization: Map<string, OrganizationInvitation[]>
  deletionReceiptsByIdempotencyKey: Map<string, OrganizationDeletionReceipt>
  profileImageUploads: Map<string, StoredProfileImageUpload>
  sessions: UserSession[]
  nextCommentId: number
  nextDeletionId: number
  nextInvitationId: number
  nextIssueId: number
  nextFileId: number
  nextProfileImageVersion: number
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
const FIXED_MUTATION_NOW = "2026-07-15T09:00:00.000Z"
const FIXED_DUE_DATE = "2026-07-21T09:30:00.000Z"
const FIXED_EXPIRES_AT = "2026-08-14T09:00:00.000Z"
const FIXED_EXPIRED_AT = "2026-07-10T09:00:00.000Z"
const PUBLIC_INVITATION_ID = "invitation-new-user"
const USER_PROFILE_IMAGE_FALLBACK =
  "https://api.dicebear.com/10.x/lorelei/svg?seed=e2e-admin-fallback"

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

const toIssueActivityValue = (value: unknown): string | string[] | null => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string")
  }
  return typeof value === "string" ? value : null
}

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
      profileImage: null,
    }
  }

  return {
    id: "user-admin",
    name: "Admin User",
    email: "admin@example.com",
    profileImage: null,
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

const deviceAccountFor = (
  sessionKey: "admin" | "new-user",
  user: UserIdentity
) => ({
  session: {
    id: sessionIdFor(sessionKey),
    token: deviceSessionTokenFor(sessionKey),
    userId: user.id,
    expiresAt: FIXED_EXPIRES_AT,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  user: {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.profileImage,
  },
})

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
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    },
    {
      id: `session-${sessionKey}-other`,
      current: false,
      expiresAt: FIXED_EXPIRES_AT,
      createdAt: "2026-07-10T09:00:00.000Z",
      updatedAt: "2026-07-13T09:00:00.000Z",
      ipAddress: "192.0.2.10",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    },
  ]

  if (sessionKey === "new-user") {
    return {
      user,
      organizations: [],
      issues: [],
      files: [],
      commentsByIssue: new Map(),
      activitiesByIssue: new Map(),
      membersByOrganization: new Map(),
      invitationsByOrganization: new Map(),
      deletionReceiptsByIdempotencyKey: new Map(),
      profileImageUploads: new Map(),
      sessions,
      nextCommentId: 1,
      nextDeletionId: 1,
      nextInvitationId: 1,
      nextIssueId: 1,
      nextFileId: 1,
      nextProfileImageVersion: 1,
    }
  }

  const organizations: Organization[] = [
    {
      id: "org-a",
      name: "Alpha Operations",
      slug: "alpha-operations",
      role: "super_admin",
      active: true,
      profileImage: null,
    },
    {
      id: "org-b",
      name: "Beta Support",
      slug: "beta-support",
      role: "member",
      active: false,
      profileImage: null,
    },
    {
      id: "org-invitations",
      name: "Invitation Operations",
      slug: "invitations",
      role: "admin",
      active: false,
      profileImage: null,
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
        assigneeId: "user-jordan",
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
      {
        id: "issue-a-2",
        organizationId: "org-a",
        number: 2,
        title: "Triage keyboard regression",
        description: "Verify focus survives an async table reorder.",
        status: "open",
        priority: "low",
        assigneeId: null,
        creatorId: user.id,
        labels: ["accessibility"],
        dueDate: null,
        createdAt: "2026-07-11T09:00:00.000Z",
        updatedAt: "2026-07-13T09:00:00.000Z",
      },
    ],
    files: [
      {
        id: "file-a-seed",
        organizationId: "org-a",
        uploadId: "upload-a-seed",
        owner: { type: "issue", id: "issue-a-1" },
        filename: "tenant-boundary-notes.txt",
        sizeBytes: 42,
        declaredContentType: "text/plain",
        previewable: false,
        textPreviewable: true,
        imageWidth: null,
        imageHeight: null,
        uploader: {
          id: user.id,
          name: user.name,
          profileImage: user.profileImage,
        },
        createdAt: "2026-07-13T10:00:00.000Z",
        canDelete: true,
        content: "Tenant boundary fixture for browser tests.",
      },
      {
        id: "file-b-seed",
        organizationId: "org-b",
        uploadId: "upload-b-seed",
        owner: { type: "issue", id: "issue-b-1" },
        filename: "beta-support-only.txt",
        sizeBytes: 36,
        declaredContentType: "text/plain",
        previewable: false,
        textPreviewable: true,
        imageWidth: null,
        imageHeight: null,
        uploader: {
          id: user.id,
          name: user.name,
          profileImage: user.profileImage,
        },
        createdAt: "2026-07-13T11:00:00.000Z",
        canDelete: true,
        content: "Private Beta tenant fixture content.",
      },
      {
        id: "file-a-image",
        organizationId: "org-a",
        uploadId: "upload-a-image",
        owner: { type: "issue", id: "issue-a-1" },
        filename: "architecture-preview.png",
        sizeBytes: 68,
        declaredContentType: "image/png",
        previewable: true,
        textPreviewable: false,
        imageWidth: 500,
        imageHeight: 300,
        uploader: {
          id: user.id,
          name: user.name,
          profileImage: user.profileImage,
        },
        createdAt: "2026-07-13T10:30:00.000Z",
        canDelete: true,
        content: PREVIEW_PNG_BASE64,
      },
    ],
    commentsByIssue: new Map([
      [
        "issue-a-1",
        [
          {
            id: "comment-a-1",
            organizationId: "org-a",
            issueId: "issue-a-1",
            authorId: user.id,
            author: user,
            body: "Tenant boundary verified in the API integration suite.",
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          },
        ],
      ],
    ]),
    activitiesByIssue: new Map([
      [
        "issue-a-1",
        [
          {
            type: "activity",
            id: "activity-a-1",
            kind: "created",
            field: null,
            fromValue: null,
            toValue: null,
            actor: {
              id: user.id,
              name: user.name,
              profileImage: user.profileImage,
            },
            createdAt: "2026-07-12T09:00:00.000Z",
          },
          {
            type: "activity",
            id: "activity-a-2",
            kind: "field_changed",
            field: "assignee",
            fromValue: null,
            toValue: "user-jordan",
            actor: {
              id: user.id,
              name: user.name,
              profileImage: user.profileImage,
            },
            createdAt: "2026-07-13T09:00:00.000Z",
          },
          {
            type: "activity",
            id: "file:file-a-seed:added",
            kind: "file_added",
            field: null,
            fromValue: null,
            toValue: "tenant-boundary-notes.txt",
            actor: {
              id: user.id,
              name: user.name,
              profileImage: user.profileImage,
            },
            createdAt: "2026-07-13T10:00:00.000Z",
          },
          {
            type: "activity",
            id: "file:file-a-image:added",
            kind: "file_added",
            field: null,
            fromValue: null,
            toValue: "architecture-preview.png",
            actor: {
              id: user.id,
              name: user.name,
              profileImage: user.profileImage,
            },
            createdAt: "2026-07-13T10:30:00.000Z",
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
            profileImage: null,
            role: "super_admin",
            createdAt: "2026-07-01T09:00:00.000Z",
          },
          {
            id: "member-jordan",
            userId: "user-jordan",
            name: "Jordan Lee",
            email: "jordan@example.com",
            profileImage: null,
            role: "admin",
            createdAt: "2026-07-02T09:00:00.000Z",
          },
          {
            id: "member-kai",
            userId: "user-kai",
            name: "Kai Brooks",
            email: "kai@example.com",
            profileImage: null,
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
            profileImage: null,
            role: "super_admin",
            createdAt: "2026-07-01T09:00:00.000Z",
          },
          {
            id: "member-admin-beta",
            userId: user.id,
            name: user.name,
            email: user.email,
            profileImage: null,
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
            inviter: { ...user },
            expiresAt: FIXED_EXPIRES_AT,
            createdAt: FIXED_NOW,
          },
          {
            id: PUBLIC_INVITATION_ID,
            email: "new-user@example.com",
            role: "member",
            status: "pending",
            organizationId: "org-a",
            inviterId: user.id,
            inviter: { ...user },
            expiresAt: FIXED_EXPIRES_AT,
            createdAt: "2026-07-13T09:00:00.000Z",
          },
          {
            id: "invitation-expired",
            email: "expired@example.com",
            role: "member",
            status: "expired",
            organizationId: "org-a",
            inviterId: user.id,
            inviter: { ...user },
            expiresAt: FIXED_EXPIRED_AT,
            createdAt: "2026-07-01T09:00:00.000Z",
          },
        ],
      ],
    ]),
    deletionReceiptsByIdempotencyKey: new Map(),
    profileImageUploads: new Map(),
    sessions,
    nextCommentId: 2,
    nextDeletionId: 1,
    nextInvitationId: 2,
    nextIssueId: 2,
    nextFileId: 2,
    nextProfileImageVersion: 1,
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

const conflict = (message: string) =>
  apiError("upload_id_conflict", message, 409)

const invalidAuthRequest = (message: string) =>
  json({ code: "INVALID_INVITATION", message }, 400)

const invitationRecipientMismatch = () =>
  json(
    {
      code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
      message: "Use the account that received this invitation",
    },
    403
  )

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
    createdAt: "2026-07-01T09:00:00.000Z",
    invitationCount: invitationsFor(state, organization.id).filter(
      ({ status }) => status === "pending"
    ).length,
    memberCount: members.length,
    memberProfileImages: members.slice(0, 3).map((member) => ({
      userId: member.userId,
      name: member.name,
      profileImage: member.profileImage,
    })),
    permissions: permissionsFor(organization.role),
  }
}

const getOrganization = (state: SessionState, organizationId: string) =>
  state.organizations.find(({ id }) => id === organizationId)

const findSharedInvitation = (invitationId: string) => {
  const ownerState = stateFor("admin")
  for (const [
    organizationId,
    invitations,
  ] of ownerState.invitationsByOrganization) {
    const invitation = invitations.find(({ id }) => id === invitationId)
    const organization = getOrganization(ownerState, organizationId)
    if (invitation && organization) {
      return { invitation, organization, ownerState }
    }
  }

  return null
}

const addInvitationMember = (
  state: SessionState,
  ownerState: SessionState,
  organization: Organization,
  invitation: OrganizationInvitation
) => {
  const member: OrganizationMember = {
    id: `member-${state.user.id}-${organization.id}`,
    userId: state.user.id,
    name: state.user.name,
    email: state.user.email,
    profileImage: state.user.profileImage,
    role: invitation.role,
    createdAt: FIXED_MUTATION_NOW,
  }
  const ownerMembers = membersFor(ownerState, organization.id)
  if (!ownerMembers.some(({ userId }) => userId === state.user.id)) {
    ownerMembers.push(member)
    ownerState.membersByOrganization.set(organization.id, ownerMembers)
  }

  state.organizations.forEach((candidate) => {
    candidate.active = false
  })
  const existingOrganization = getOrganization(state, organization.id)
  if (existingOrganization) {
    existingOrganization.active = true
    existingOrganization.role = invitation.role
  } else {
    state.organizations.push({
      ...organization,
      active: true,
      role: invitation.role,
    })
  }

  if (state !== ownerState) {
    state.membersByOrganization.set(
      organization.id,
      structuredClone(ownerMembers)
    )
  }

  return member
}

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

const filePayload = ({
  organizationId: _organizationId,
  uploadId: _uploadId,
  content: _content,
  ...file
}: StoredFileAttachment): FileAttachment => file

const updateUserProfileImageSnapshots = (
  state: SessionState,
  profileImage: string | null
) => {
  state.user.profileImage = profileImage
  for (const members of state.membersByOrganization.values()) {
    for (const member of members) {
      if (member.userId === state.user.id) member.profileImage = profileImage
    }
  }
  for (const comments of state.commentsByIssue.values()) {
    for (const comment of comments) {
      if (comment.author.id === state.user.id) {
        comment.author.profileImage = profileImage
      }
    }
  }
  for (const activities of state.activitiesByIssue.values()) {
    for (const activity of activities) {
      if (activity.actor.id === state.user.id) {
        activity.actor.profileImage = profileImage
      }
    }
  }
  for (const file of state.files) {
    if (file.uploader.id === state.user.id) {
      file.uploader.profileImage = profileImage
    }
  }
}

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
    if (
      pathname === "/__e2e/profile-images/fallback" &&
      request.method === "POST"
    ) {
      const body = await readBody(request)
      const state = stateFor("admin")
      if (body.subject === "user") {
        updateUserProfileImageSnapshots(state, USER_PROFILE_IMAGE_FALLBACK)
        return json({ profileImage: USER_PROFILE_IMAGE_FALLBACK }, 201)
      }
      if (body.subject === "organization") {
        const organizationId = nonEmptyString(body.organizationId)
        const organization = organizationId
          ? getOrganization(state, organizationId)
          : undefined
        if (!organization) return notFound("Organization")
        const profileImage = `https://api.dicebear.com/10.x/shapes/svg?seed=${encodeURIComponent(organization.id)}`
        organization.profileImage = profileImage
        return json({ profileImage }, 201)
      }
      return invalid("subject must be user or organization")
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
      const identity = stateFor(sessionKey).user
      return json({
        session: {
          id: sessionIdFor(sessionKey),
          userId: identity.id,
          expiresAt: FIXED_EXPIRES_AT,
        },
        user: {
          id: identity.id,
          name: identity.name,
          email: identity.email,
          image: identity.profileImage,
        },
      })
    }
    if (!sessionKey) return unauthorized()

    if (
      pathname === "/auth/organization/get-invitation" &&
      request.method === "GET"
    ) {
      const invitationId = nonEmptyString(url.searchParams.get("id"))
      if (!invitationId) return invalidAuthRequest("Invitation ID is required")

      const sharedInvitation = findSharedInvitation(invitationId)
      if (
        !sharedInvitation ||
        sharedInvitation.invitation.status !== "pending"
      ) {
        return invalidAuthRequest("Invitation is invalid or unavailable")
      }
      if (
        sharedInvitation.invitation.email.toLowerCase() !==
        identityFor(sessionKey).email.toLowerCase()
      ) {
        return invitationRecipientMismatch()
      }

      return json({
        id: sharedInvitation.invitation.id,
        organizationId: sharedInvitation.organization.id,
        organizationName: sharedInvitation.organization.name,
        organizationSlug: sharedInvitation.organization.slug,
        inviterEmail: sharedInvitation.invitation.inviter.email,
        role: sharedInvitation.invitation.role,
        status: sharedInvitation.invitation.status,
        expiresAt: sharedInvitation.invitation.expiresAt,
        createdAt: sharedInvitation.invitation.createdAt,
      })
    }

    if (
      pathname === "/auth/multi-session/list-device-sessions" &&
      request.method === "GET"
    ) {
      return json([
        deviceAccountFor("admin", stateFor("admin").user),
        deviceAccountFor("new-user", stateFor("new-user").user),
      ])
    }
    if (
      pathname === "/auth/multi-session/set-active" &&
      request.method === "POST"
    ) {
      const body = await readBody(request)
      const nextSessionKey = sessionKeyFromDeviceToken(body.sessionToken)
      if (!nextSessionKey) return unauthorized()

      return json(
        deviceAccountFor(nextSessionKey, stateFor(nextSessionKey).user),
        200,
        {
          "set-cookie": `e2e-session=${nextSessionKey}; Path=/; HttpOnly; SameSite=Lax`,
        }
      )
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

    const userProfileImageMatch = pathname.match(
      /^\/files\/profile-images\/users\/([^/]+)$/
    )
    if (userProfileImageMatch?.[1]) {
      const subject = decodeURIComponent(userProfileImageMatch[1])
      if (request.method === "GET") {
        if (subject !== state.user.id || !state.user.profileImage) {
          return notFound("Profile image")
        }
        return new Response(Buffer.from(PREVIEW_PNG_BASE64, "base64"), {
          headers: {
            ...corsHeaders,
            "cache-control": "private, no-cache",
            "content-type": "image/png",
            // E2EはWeb/APIを別loopback portで動かすため、productionの
            // same-site topologyはAPI integration test側で固定する。
            "cross-origin-resource-policy": "cross-origin",
            "x-content-type-options": "nosniff",
          },
        })
      }
      if (subject !== "me") return notFound("Profile image")
      if (request.method === "POST") {
        const form = await request.formData()
        const uploadId = nonEmptyString(form.get("uploadId"))
        const declaredSize = Number(form.get("fileSize"))
        const uploaded = form.get("file")
        if (
          !uploadId ||
          !(uploaded instanceof File) ||
          !Number.isInteger(declaredSize) ||
          declaredSize !== uploaded.size
        ) {
          return invalid("uploadId, fileSize and file are required")
        }
        const content = Buffer.from(await uploaded.arrayBuffer()).toString(
          "base64"
        )
        const replayKey = `user:${state.user.id}:${uploadId}`
        const replay = state.profileImageUploads.get(replayKey)
        if (replay) {
          if (
            replay.content !== content ||
            replay.contentType !== uploaded.type ||
            replay.sizeBytes !== uploaded.size
          ) {
            return conflict("The upload ID is already in use")
          }
          updateUserProfileImageSnapshots(state, replay.dto.profileImage)
          return json(replay.dto)
        }
        const imageId = `profile-image-${state.user.id}-${state.nextProfileImageVersion}`
        state.nextProfileImageVersion += 1
        const profileImage = `/files/profile-images/users/${state.user.id}?v=${encodeURIComponent(imageId)}`
        const dto = {
          id: imageId,
          profileImage,
          width: 512 as const,
          height: 512 as const,
          updatedAt: FIXED_MUTATION_NOW,
        }
        state.profileImageUploads.set(replayKey, {
          content,
          contentType: uploaded.type,
          dto,
          previousProfileImage: state.user.profileImage,
          sizeBytes: uploaded.size,
        })
        updateUserProfileImageSnapshots(state, profileImage)
        return json(dto, 201)
      }
      if (request.method === "DELETE") {
        const currentUpload = [...state.profileImageUploads.values()].find(
          ({ dto }) => dto.profileImage === state.user.profileImage
        )
        updateUserProfileImageSnapshots(
          state,
          currentUpload?.previousProfileImage ?? null
        )
        return new Response(null, { status: 204, headers: corsHeaders })
      }
    }

    const organizationProfileImageMatch = pathname.match(
      /^\/files\/profile-images\/organizations\/([^/]+)$/
    )
    if (organizationProfileImageMatch?.[1]) {
      const organizationId = decodeURIComponent(
        organizationProfileImageMatch[1]
      )
      const access = resolveOrganization(state, organizationId, {
        requireActive: request.method !== "GET",
      })
      if ("response" in access) return access.response
      if (request.method === "GET") {
        if (!access.organization.profileImage) {
          return notFound("Profile image")
        }
        return new Response(Buffer.from(PREVIEW_PNG_BASE64, "base64"), {
          headers: {
            ...corsHeaders,
            "cache-control": "private, no-cache",
            "content-type": "image/png",
            // E2EはWeb/APIを別loopback portで動かすため、productionの
            // same-site topologyはAPI integration test側で固定する。
            "cross-origin-resource-policy": "cross-origin",
            "x-content-type-options": "nosniff",
          },
        })
      }
      if (access.organization.role !== "super_admin") return forbidden()
      if (request.method === "POST") {
        const form = await request.formData()
        const uploadId = nonEmptyString(form.get("uploadId"))
        const declaredSize = Number(form.get("fileSize"))
        const uploaded = form.get("file")
        if (
          !uploadId ||
          !(uploaded instanceof File) ||
          !Number.isInteger(declaredSize) ||
          declaredSize !== uploaded.size
        ) {
          return invalid("uploadId, fileSize and file are required")
        }
        const content = Buffer.from(await uploaded.arrayBuffer()).toString(
          "base64"
        )
        const replayKey = `organization:${organizationId}:${uploadId}`
        const replay = state.profileImageUploads.get(replayKey)
        if (replay) {
          if (
            replay.content !== content ||
            replay.contentType !== uploaded.type ||
            replay.sizeBytes !== uploaded.size
          ) {
            return conflict("The upload ID is already in use")
          }
          access.organization.profileImage = replay.dto.profileImage
          return json(replay.dto)
        }
        const imageId = `profile-image-${organizationId}-${state.nextProfileImageVersion}`
        state.nextProfileImageVersion += 1
        const profileImage = `/files/profile-images/organizations/${organizationId}?v=${encodeURIComponent(imageId)}`
        const dto = {
          id: imageId,
          profileImage,
          width: 512 as const,
          height: 512 as const,
          updatedAt: FIXED_MUTATION_NOW,
        }
        state.profileImageUploads.set(replayKey, {
          content,
          contentType: uploaded.type,
          dto,
          previousProfileImage: access.organization.profileImage,
          sizeBytes: uploaded.size,
        })
        access.organization.profileImage = profileImage
        return json(dto, 201)
      }
      if (request.method === "DELETE") {
        const currentUpload = [...state.profileImageUploads.values()].find(
          ({ dto }) => dto.profileImage === access.organization.profileImage
        )
        access.organization.profileImage =
          currentUpload?.previousProfileImage ?? null
        return new Response(null, { status: 204, headers: corsHeaders })
      }
    }

    if (pathname === "/me/sessions" && request.method === "GET") {
      return json(state.sessions)
    }
    if (pathname === "/me/sessions" && request.method === "DELETE") {
      const revoked = state.sessions.filter(({ current }) => !current).length
      state.sessions = state.sessions.filter(({ current }) => current)
      return json({ revoked })
    }

    const fileOwnerMatch = pathname.match(
      /^\/files\/organizations\/([^/]+)\/owners\/([^/]+)\/([^/]+)$/
    )
    if (fileOwnerMatch?.[1] && fileOwnerMatch[2] && fileOwnerMatch[3]) {
      const organizationId = decodeURIComponent(fileOwnerMatch[1])
      const ownerType = decodeURIComponent(fileOwnerMatch[2])
      const ownerId = decodeURIComponent(fileOwnerMatch[3])
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      if (ownerType !== "issue") return notFound("File owner")
      const issue = findIssue(state, ownerId, access.organization.id)
      if (!issue) return notFound("Issue")

      if (request.method === "GET") {
        return json({
          items: state.files
            .filter(
              (file) =>
                file.organizationId === organizationId &&
                file.owner.type === "issue" &&
                file.owner.id === ownerId
            )
            .toSorted((left, right) =>
              right.createdAt.localeCompare(left.createdAt)
            )
            .map(filePayload),
          nextCursor: null,
        })
      }

      if (request.method === "POST") {
        const form = await request.formData()
        const uploadId = nonEmptyString(form.get("uploadId"))
        const declaredSize = Number(form.get("fileSize"))
        const uploaded = form.get("file")
        if (
          !uploadId ||
          !(uploaded instanceof File) ||
          !Number.isInteger(declaredSize) ||
          declaredSize !== uploaded.size
        ) {
          return invalid("uploadId, fileSize and file are required")
        }

        const content = await uploaded.text()
        const declaredContentType =
          uploaded.type.length > 0 ? uploaded.type : "application/octet-stream"

        const replay = state.files.find(
          (file) =>
            file.organizationId === organizationId && file.uploadId === uploadId
        )
        if (replay) {
          if (
            replay.owner.type !== "issue" ||
            replay.owner.id !== ownerId ||
            replay.filename !== uploaded.name ||
            replay.sizeBytes !== uploaded.size ||
            replay.declaredContentType !== declaredContentType ||
            replay.content !== content
          ) {
            return conflict("The upload ID is already in use")
          }
          return json(filePayload(replay))
        }

        if (uploaded.name.startsWith("cancel-")) {
          await Bun.sleep(3_000)
          if (request.signal.aborted) {
            return new Response(null, { status: 499, headers: corsHeaders })
          }
        }

        const file: StoredFileAttachment = {
          id: `file-${sessionKey}-${state.nextFileId}`,
          organizationId,
          uploadId,
          owner: { type: "issue", id: issue.id },
          filename: uploaded.name,
          sizeBytes: uploaded.size,
          declaredContentType,
          previewable: false,
          textPreviewable:
            declaredContentType.startsWith("text/") &&
            declaredContentType !== "text/html",
          imageWidth: null,
          imageHeight: null,
          uploader: {
            id: state.user.id,
            name: state.user.name,
            profileImage: state.user.profileImage,
          },
          createdAt: FIXED_MUTATION_NOW,
          canDelete: true,
          content,
        }
        state.nextFileId += 1
        state.files.push(file)
        const activities = state.activitiesByIssue.get(issue.id) ?? []
        activities.push({
          type: "activity",
          id: `file:${file.id}:added`,
          kind: "file_added",
          field: null,
          fromValue: null,
          toValue: file.filename,
          actor: {
            id: state.user.id,
            name: state.user.name,
            profileImage: state.user.profileImage,
          },
          createdAt: FIXED_MUTATION_NOW,
        })
        state.activitiesByIssue.set(issue.id, activities)
        return json(filePayload(file), 201)
      }
    }

    const fileTextPreviewMatch = pathname.match(
      /^\/files\/organizations\/([^/]+)\/([^/]+)\/text-preview$/
    )
    if (
      fileTextPreviewMatch?.[1] &&
      fileTextPreviewMatch[2] &&
      request.method === "GET"
    ) {
      const organizationId = decodeURIComponent(fileTextPreviewMatch[1])
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const file = state.files.find(
        (candidate) =>
          candidate.id === decodeURIComponent(fileTextPreviewMatch[2] ?? "") &&
          candidate.organizationId === access.organization.id
      )
      if (!file) return notFound("File")
      if (!file.textPreviewable) {
        return apiError(
          "unsupported_media_type",
          "This file cannot be previewed as text",
          415
        )
      }
      return json({ content: file.content, truncated: false }, 200, {
        "cache-control": "private, no-store",
        "cross-origin-resource-policy": "same-site",
        "x-content-type-options": "nosniff",
      })
    }

    const fileImagePreviewMatch = pathname.match(
      /^\/files\/organizations\/([^/]+)\/([^/]+)\/preview\/(360|720|1200|2400)$/
    )
    if (
      fileImagePreviewMatch?.[1] &&
      fileImagePreviewMatch[2] &&
      request.method === "GET"
    ) {
      const organizationId = decodeURIComponent(fileImagePreviewMatch[1])
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const file = state.files.find(
        (candidate) =>
          candidate.id === decodeURIComponent(fileImagePreviewMatch[2] ?? "") &&
          candidate.organizationId === access.organization.id
      )
      if (!file) return notFound("File")
      if (!file.previewable) return notFound("File preview")
      return new Response(Buffer.from(PREVIEW_PNG_BASE64, "base64"), {
        headers: {
          ...corsHeaders,
          "cache-control": "private, no-cache",
          "content-type": "image/png",
          "x-content-type-options": "nosniff",
        },
      })
    }

    const fileDownloadMatch = pathname.match(
      /^\/files\/organizations\/([^/]+)\/([^/]+)\/download$/
    )
    if (
      fileDownloadMatch?.[1] &&
      fileDownloadMatch[2] &&
      request.method === "GET"
    ) {
      const organizationId = decodeURIComponent(fileDownloadMatch[1])
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const file = state.files.find(
        (candidate) =>
          candidate.id === decodeURIComponent(fileDownloadMatch[2] ?? "") &&
          candidate.organizationId === access.organization.id
      )
      if (!file) return notFound("File")
      return new Response(file.content, {
        headers: {
          ...corsHeaders,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
          "content-type": "application/octet-stream",
          "x-content-type-options": "nosniff",
        },
      })
    }

    const fileMatch = pathname.match(
      /^\/files\/organizations\/([^/]+)\/([^/]+)$/
    )
    if (fileMatch?.[1] && fileMatch[2] && request.method === "DELETE") {
      const organizationId = decodeURIComponent(fileMatch[1])
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      const fileIndex = state.files.findIndex(
        (candidate) =>
          candidate.id === decodeURIComponent(fileMatch[2] ?? "") &&
          candidate.organizationId === access.organization.id
      )
      const file = state.files[fileIndex]
      if (!file) return notFound("File")
      if (!file.canDelete) return forbidden()
      state.files.splice(fileIndex, 1)
      const activities = state.activitiesByIssue.get(file.owner.id) ?? []
      activities.push({
        type: "activity",
        id: `file:${file.id}:deleted`,
        kind: "file_deleted",
        field: null,
        fromValue: file.filename,
        toValue: null,
        actor: {
          id: state.user.id,
          name: state.user.name,
          profileImage: state.user.profileImage,
        },
        createdAt: FIXED_MUTATION_NOW,
      })
      state.activitiesByIssue.set(file.owner.id, activities)
      return new Response(null, { status: 204, headers: corsHeaders })
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
        profileImage: null,
      }
      state.organizations.push(organization)
      state.membersByOrganization.set(organization.id, [
        {
          id: `member-${state.user.id}-${organization.id}`,
          userId: state.user.id,
          name: state.user.name,
          email: state.user.email,
          profileImage: state.user.profileImage,
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
            inviter: { ...state.user },
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

    const resendInvitationMatch = pathname.match(
      /^\/organizations\/([^/]+)\/invitations\/([^/]+)\/resend$/
    )
    if (
      resendInvitationMatch?.[1] &&
      resendInvitationMatch[2] &&
      request.method === "POST"
    ) {
      const access = resolveOrganization(state, resendInvitationMatch[1])
      if ("response" in access) return access.response
      const { organization } = access
      if (!permissionsFor(organization.role).canInviteMembers) {
        return forbidden()
      }
      const invitation = invitationsFor(state, organization.id).find(
        ({ id }) => id === resendInvitationMatch[2]
      )
      if (!invitation) return notFound("Invitation")
      if (
        invitation.role === "admin" &&
        !permissionsFor(organization.role).canManageAdmins
      ) {
        return forbidden()
      }
      if (invitation.status !== "pending" && invitation.status !== "expired") {
        return apiError(
          "conflict",
          "Only pending or expired invitations can be resent",
          409
        )
      }

      const revived = invitation.status === "expired"
      invitation.status = "pending"
      invitation.expiresAt = FIXED_EXPIRES_AT
      invitation.inviterId = state.user.id
      invitation.inviter = { ...state.user }
      return json({ invitation, delivery: "queued", revived })
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
      invitation.status = "canceled"
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
        state.files = state.files.filter(
          (file) => file.organizationId !== organizationId
        )
        deletedIssueIds.forEach((issueId) => {
          state.commentsByIssue.delete(issueId)
          state.activitiesByIssue.delete(issueId)
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
      const body = await readBody(request)
      const invitationId = nonEmptyString(body.invitationId)
      if (!invitationId) return invalidAuthRequest("Invitation ID is required")

      const sharedInvitation = findSharedInvitation(invitationId)
      if (
        !sharedInvitation ||
        sharedInvitation.invitation.status !== "pending"
      ) {
        return invalidAuthRequest("Invitation is invalid or unavailable")
      }
      if (
        sharedInvitation.invitation.email.toLowerCase() !==
        state.user.email.toLowerCase()
      ) {
        return invitationRecipientMismatch()
      }

      if (pathname.includes("reject")) {
        sharedInvitation.invitation.status = "rejected"
        return json({ invitation: sharedInvitation.invitation })
      }

      const member = addInvitationMember(
        state,
        sharedInvitation.ownerState,
        sharedInvitation.organization,
        sharedInvitation.invitation
      )
      sharedInvitation.invitation.status = "accepted"
      return json({ invitation: sharedInvitation.invitation, member })
    }

    const commentMatch = pathname.match(
      /^\/issues\/([^/]+)\/comments\/([^/]+)$/
    )
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
      /^\/issues\/([^/]+)\/comments$/
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
          issueId: issue.id,
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

    if (pathname === "/issues" && request.method === "GET") {
      const organizationId = url.searchParams.get("organizationId")
      const access = resolveOrganization(state, organizationId)
      if ("response" in access) return access.response
      return json(
        state.issues.filter(
          (issue) => issue.organizationId === access.organization.id
        )
      )
    }
    if (pathname === "/issues" && request.method === "POST") {
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
      state.activitiesByIssue.set(issue.id, [
        {
          type: "activity",
          id: `activity-${issue.id}-created`,
          kind: "created",
          field: null,
          fromValue: null,
          toValue: null,
          actor: {
            id: state.user.id,
            name: state.user.name,
            profileImage: state.user.profileImage,
          },
          createdAt: FIXED_NOW,
        },
      ])
      return json(issue, 201)
    }

    const byNumberMatch = pathname.match(/^\/issues\/by-number\/(\d+)$/)
    if (byNumberMatch?.[1] && request.method === "GET") {
      const access = resolveOrganization(
        state,
        url.searchParams.get("organizationId")
      )
      if ("response" in access) return access.response
      const issue = state.issues.find(
        (candidate) =>
          candidate.number === Number(byNumberMatch[1]) &&
          candidate.organizationId === access.organization.id
      )
      return issue ? json(issue) : notFound("Issue")
    }

    const timelineMatch = pathname.match(/^\/issues\/([^/]+)\/timeline$/)
    if (timelineMatch?.[1] && request.method === "GET") {
      const access = resolveOrganization(
        state,
        url.searchParams.get("organizationId")
      )
      if ("response" in access) return access.response
      const issue = findIssue(state, timelineMatch[1], access.organization.id)
      if (!issue) return notFound("Issue")
      const comments = (state.commentsByIssue.get(issue.id) ?? []).map(
        (comment) => ({
          type: "comment" as const,
          id: comment.id,
          organizationId: comment.organizationId,
          issueId: comment.issueId,
          authorId: comment.authorId,
          author: comment.author,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        })
      )
      const activities = state.activitiesByIssue.get(issue.id) ?? []
      const items = [...activities, ...comments].toSorted((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      )
      return json({ items, nextCursor: null })
    }

    const issueMatch = pathname.match(/^\/issues\/([^/]+)$/)
    if (issueMatch?.[1]) {
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
          issue.id === issueMatch[1] &&
          issue.organizationId === verifiedOrganizationId
      )
      const issue = state.issues[issueIndex]
      if (!issue) return notFound("Issue")

      if (request.method === "GET") return json(issue)
      if (request.method === "PATCH") {
        const activityFields = [
          ["title", issue.title, body.title],
          ["description", issue.description, body.description],
          ["status", issue.status, body.status],
          ["priority", issue.priority, body.priority],
          ["assignee", issue.assigneeId, body.assigneeId],
          ["labels", issue.labels, body.labels],
          ["due_date", issue.dueDate, body.dueDate],
        ] as const
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
        issue.updatedAt = FIXED_MUTATION_NOW
        const activities = state.activitiesByIssue.get(issue.id) ?? []
        activityFields.forEach(([field, fromValue, toValue], position) => {
          if (
            toValue === undefined ||
            JSON.stringify(fromValue) === JSON.stringify(toValue)
          )
            return
          activities.push({
            type: "activity",
            id: `activity-${issue.id}-${position}-${activities.length}`,
            kind: "field_changed",
            field,
            fromValue,
            toValue: toIssueActivityValue(toValue),
            actor: {
              id: state.user.id,
              name: state.user.name,
              profileImage: state.user.profileImage,
            },
            createdAt: FIXED_MUTATION_NOW,
          })
        })
        state.activitiesByIssue.set(issue.id, activities)
        return json(issue)
      }
      if (request.method === "DELETE") {
        state.issues.splice(issueIndex, 1)
        state.files = state.files.filter(
          (file) => file.owner.type !== "issue" || file.owner.id !== issue.id
        )
        state.commentsByIssue.delete(issue.id)
        state.activitiesByIssue.delete(issue.id)
        return json(issue)
      }
    }

    return apiError("not_found", pathname, 404)
  },
})

console.log("E2E mock API listening on http://127.0.0.1:3001")
