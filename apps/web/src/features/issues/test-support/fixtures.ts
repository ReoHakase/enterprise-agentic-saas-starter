import type {
  IssueAssigneeOption,
  IssueCommentUiItem,
  IssueUiItem,
} from "../components/types"
import type {
  Issue,
  IssueActivity,
  IssueListItem,
  IssueTimelinePage,
} from "../schema"
import { defaultIssueSearchState } from "../search-params.shared"

export const fictionalIssue = {
  id: "issue_01K1BILLING00000000000",
  organizationId: "org_01K1ACMECLOUD0000000000",
  number: 12,
  title: "Fix billing webhook retries",
  description: "Retry failed invoice events with an idempotency key.",
  status: "open",
  priority: "urgent",
  assigneeId: "user_01K1JORDAN0000000000000",
  creatorId: "user_01K1AVERY00000000000000",
  labels: ["billing", "bug"],
  dueDate: "2026-07-30T09:30:00.000Z",
  revision: 1,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
} satisfies Issue

export const fictionalIssueListItem = {
  ...fictionalIssue,
  attachmentCount: 3,
  commentCount: 2,
  thumbnail: null,
} satisfies IssueListItem

export const fictionalIssueView = {
  ...fictionalIssueListItem,
} satisfies IssueUiItem

export const fictionalIssueAssignees = [
  {
    id: "user_01K1JORDAN0000000000000",
    name: "Jordan Lee",
    email: "jordan@example.test",
    profileImage: null,
  },
] satisfies IssueAssigneeOption[]

const fictionalIssueActivity = {
  type: "activity",
  id: "activity_01K1STATUS00000000000",
  kind: "field_changed",
  field: "status",
  fromValue: "open",
  toValue: "in_progress",
  actor: {
    id: "user_01K1AVERY00000000000000",
    name: "Avery Stone",
    profileImage: null,
  },
  createdAt: "2026-07-11T00:00:00.000Z",
} satisfies IssueActivity

const fictionalIssueComment = {
  id: "comment_01K1RETRY000000000000",
  authorId: "user_01K1JORDAN0000000000000",
  author: {
    id: "user_01K1JORDAN0000000000000",
    name: "Jordan Lee",
    profileImage: null,
  },
  body: "Verified the retry path in staging.",
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
} satisfies IssueCommentUiItem

export const fictionalIssueTimeline = {
  items: [
    fictionalIssueActivity,
    {
      type: "comment",
      ...fictionalIssueComment,
      organizationId: fictionalIssue.organizationId,
      issueId: fictionalIssue.id,
    },
  ],
  nextCursor: null,
} satisfies IssueTimelinePage

export const fictionalIssueSearchState = {
  ...defaultIssueSearchState,
} as const
