import * as v from "valibot"

import {
  isoTimestampModel,
  nonEmptyStringModel,
  positiveIntegerQueryModel,
} from "../../models/common"

const issueStatusModel = v.picklist(["open", "in_progress", "closed"])

const issuePriorityModel = v.picklist([
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

const assigneeIdQueryModel = v.pipe(v.string(), v.maxLength(128))
const labelQueryModel = v.pipe(v.string(), v.minLength(1), v.maxLength(40))
const calendarDateOnlyModel = v.pipe(
  v.string(),
  v.isoDate(),
  v.check((value) => {
    const [yearText, monthText, dayText] = value.split("-")
    if (!(yearText && monthText && dayText)) return false
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const date = new Date(0)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCFullYear(year, month - 1, day)
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    )
  }, "Invalid calendar date")
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
    revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
    createdAt: isoTimestampModel,
    updatedAt: isoTimestampModel,
  }),
  v.metadata({
    title: "Issue",
    description:
      "Issue identified by a sequence number that is unique within one organization.",
  })
)

const issueThumbnailFileModel = v.object({
  id: v.string(),
  filename: v.string(),
  imageWidth: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  imageHeight: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

export const issueThumbnailModel = v.object({
  mode: v.picklist(["automatic", "selected"]),
  file: v.nullable(issueThumbnailFileModel),
})

const issueListItemModel = v.object({
  ...issueModel.entries,
  attachmentCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  commentCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  thumbnail: v.nullable(issueThumbnailFileModel),
})

export const listIssuesResponseModel = v.object({
  items: v.array(issueListItemModel),
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  pageSize: v.union([v.literal(20), v.literal(50), v.literal(100)]),
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
})

export const listIssuesQueryModel = v.strictObject({
  organizationId: organizationIdModel,
  search: v.optional(v.pipe(v.string(), v.maxLength(200))),
  statuses: v.optional(
    v.union([
      issueStatusModel,
      v.pipe(v.array(issueStatusModel), v.maxLength(3)),
    ])
  ),
  priorityFrom: v.optional(issuePriorityModel),
  priorityTo: v.optional(issuePriorityModel),
  assigneeIds: v.optional(
    v.union([
      assigneeIdQueryModel,
      v.pipe(v.array(assigneeIdQueryModel), v.maxLength(50)),
    ])
  ),
  labels: v.optional(
    v.union([
      labelQueryModel,
      v.pipe(v.array(labelQueryModel), v.maxLength(20)),
    ])
  ),
  labelMode: v.optional(v.picklist(["any", "all"])),
  dueDateFrom: v.optional(calendarDateOnlyModel),
  dueDateTo: v.optional(calendarDateOnlyModel),
  dueDateFromOffsetMinutes: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.toNumber(),
      v.number(),
      v.integer(),
      v.minValue(-840),
      v.maxValue(840)
    )
  ),
  dueDateToExclusiveOffsetMinutes: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.toNumber(),
      v.number(),
      v.integer(),
      v.minValue(-840),
      v.maxValue(840)
    )
  ),
  dueDateOffsetMinutes: v.optional(
    v.pipe(
      v.union([v.number(), v.string()]),
      v.toNumber(),
      v.number(),
      v.integer(),
      v.minValue(-840),
      v.maxValue(840)
    )
  ),
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
  page: v.optional(positiveIntegerQueryModel(100_000), 1),
  pageSize: v.optional(
    v.pipe(positiveIntegerQueryModel(100), v.picklist([20, 50, 100])),
    20
  ),
})

export const listIssueLabelsQueryModel = v.object({
  organizationId: organizationIdModel,
  search: v.optional(v.pipe(v.string(), v.maxLength(40))),
})

export const listIssueLabelsResponseModel = v.object({
  items: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(50)),
})

export const getIssueQueryModel = v.object({
  organizationId: organizationIdModel,
})

export const updateIssueThumbnailBodyModel = v.object({
  organizationId: organizationIdModel,
  fileId: v.nullable(nonEmptyStringModel),
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
      profileImage: v.nullable(v.string()),
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

export const deleteIssueCommentBodyModel = v.object({
  organizationId: organizationIdModel,
})

const timelineActorModel = v.object({
  id: v.nullable(v.string()),
  name: v.string(),
  profileImage: v.nullable(v.string()),
})

const issueActivityValueModel = v.union([
  v.string(),
  v.array(v.string()),
  v.null(),
])

const issueActivityModel = v.object({
  type: v.literal("activity"),
  id: v.string(),
  kind: v.picklist([
    "created",
    "field_changed",
    "legacy_updated",
    "file_added",
    "file_deleted",
  ]),
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

const issueTimelineCommentModel = v.object({
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
