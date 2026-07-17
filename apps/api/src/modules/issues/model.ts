import * as v from "valibot"

import {
  isoTimestampModel,
  nonEmptyStringModel,
  positiveIntegerQueryModel,
} from "../../models/common"

export const issueStatusModel = v.picklist(["open", "in_progress", "closed"])

export const issuePriorityModel = v.picklist([
  "no_priority",
  "low",
  "medium",
  "high",
  "urgent",
])

const organizationIdModel = v.pipe(
  nonEmptyStringModel,
  v.metadata({
    description: "active organization id",
    examples: ["org_01JQ8YF2J7Q0J2X8R8S3Q9M6P4"],
  })
)

const labelsModel = v.pipe(
  v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(40))),
  v.maxLength(20)
)

export const issueModel = v.pipe(
  v.object({
    id: v.string(),
    organizationId: v.string(),
    number: v.pipe(v.number(), v.integer(), v.minValue(1)),
    title: v.string(),
    description: v.string(),
    status: issueStatusModel,
    priority: issuePriorityModel,
    assigneeId: v.nullable(v.string()),
    creatorId: v.string(),
    labels: labelsModel,
    dueDate: v.nullable(isoTimestampModel),
    createdAt: isoTimestampModel,
    updatedAt: isoTimestampModel,
  }),
  v.metadata({
    title: "Issue",
    description: "organization内で連番を持つissue",
  })
)

export const listIssuesResponseModel = v.array(issueModel)

export const listIssuesQueryModel = v.object({
  organizationId: organizationIdModel,
  search: v.optional(v.pipe(v.string(), v.maxLength(200))),
  status: v.optional(issueStatusModel),
  priority: v.optional(issuePriorityModel),
  assigneeId: v.optional(v.string()),
  label: v.optional(v.pipe(v.string(), v.maxLength(40))),
  sortBy: v.optional(
    v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ])
  ),
  sortDirection: v.optional(v.picklist(["asc", "desc"])),
  limit: v.optional(positiveIntegerQueryModel(100)),
})

export const getIssueQueryModel = v.object({
  organizationId: organizationIdModel,
})

export const getIssueByNumberParamsModel = v.object({
  number: positiveIntegerQueryModel(Number.MAX_SAFE_INTEGER),
})

export const createIssueBodyModel = v.object({
  organizationId: organizationIdModel,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  status: v.optional(issueStatusModel),
  priority: v.optional(issuePriorityModel),
  assigneeId: v.optional(v.nullable(v.string())),
  labels: v.optional(labelsModel),
  dueDate: v.optional(v.nullable(isoTimestampModel)),
})

export const updateIssueParamsModel = v.object({ id: nonEmptyStringModel })

export const updateIssueBodyModel = v.object({
  organizationId: organizationIdModel,
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.pipe(v.string(), v.maxLength(50_000))),
  status: v.optional(issueStatusModel),
  priority: v.optional(issuePriorityModel),
  assigneeId: v.optional(v.nullable(v.string())),
  labels: v.optional(labelsModel),
  dueDate: v.optional(v.nullable(isoTimestampModel)),
})

export const deleteIssueParamsModel = updateIssueParamsModel
export const deleteIssueBodyModel = v.object({
  organizationId: organizationIdModel,
})

export const issueCommentModel = v.pipe(
  v.object({
    id: v.string(),
    organizationId: v.string(),
    issueId: v.string(),
    authorId: v.string(),
    author: v.object({
      id: v.string(),
      name: v.string(),
      image: v.nullable(v.string()),
    }),
    body: v.string(),
    createdAt: isoTimestampModel,
    updatedAt: isoTimestampModel,
  }),
  v.metadata({ title: "IssueComment" })
)

export const listIssueCommentsResponseModel = v.array(issueCommentModel)

export const issueCommentParamsModel = v.object({
  id: nonEmptyStringModel,
  commentId: nonEmptyStringModel,
})

export const createIssueCommentBodyModel = v.object({
  organizationId: organizationIdModel,
  body: v.pipe(v.string(), v.minLength(1), v.maxLength(20_000)),
})

export const updateIssueCommentBodyModel = createIssueCommentBodyModel
export const deleteIssueCommentBodyModel = v.object({
  organizationId: organizationIdModel,
})

const timelineActorModel = v.object({
  id: v.nullable(v.string()),
  name: v.string(),
  image: v.nullable(v.string()),
})

const issueActivityValueModel = v.union([
  v.string(),
  v.array(v.string()),
  v.null(),
])

export const issueActivityModel = v.object({
  type: v.literal("activity"),
  id: v.string(),
  kind: v.picklist(["created", "field_changed", "legacy_updated"]),
  field: v.nullable(
    v.picklist([
      "title",
      "description",
      "status",
      "priority",
      "assignee",
      "labels",
      "due_date",
    ])
  ),
  fromValue: issueActivityValueModel,
  toValue: issueActivityValueModel,
  actor: timelineActorModel,
  createdAt: isoTimestampModel,
})

export const issueTimelineCommentModel = v.object({
  type: v.literal("comment"),
  ...issueCommentModel.entries,
})

export const issueTimelinePageModel = v.object({
  items: v.array(v.union([issueActivityModel, issueTimelineCommentModel])),
  nextCursor: v.nullable(v.string()),
})

export const issueTimelineQueryModel = v.object({
  organizationId: organizationIdModel,
  cursor: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(1_024))),
  limit: v.optional(positiveIntegerQueryModel(100)),
})
