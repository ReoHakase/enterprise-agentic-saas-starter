import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

const boundedString = (maximum: number) =>
  v.pipe(v.string(), v.maxLength(maximum))
const formIdentifier = v.pipe(v.string(), v.minLength(1), v.maxLength(128))
const issueRevision = v.pipe(v.number(), v.integer(), v.minValue(1))
const formTarget = {
  expectedEpoch: v.optional(formIdentifier),
  expectedRevision: v.optional(issueRevision),
  formId: v.optional(formIdentifier),
}

const issueQuerySchema = v.strictObject({
  assignee: v.optional(boundedString(128)),
  dir: v.optional(v.picklist(["asc", "desc"])),
  label: v.optional(boundedString(40)),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))
  ),
  priority: v.optional(
    v.picklist(["all", "no_priority", "low", "medium", "high", "urgent"])
  ),
  q: v.optional(boundedString(200)),
  sort: v.optional(
    v.picklist([
      "number",
      "createdAt",
      "updatedAt",
      "dueDate",
      "priority",
      "status",
    ])
  ),
  status: v.optional(v.picklist(["all", "open", "in_progress", "closed"])),
})

const agentClientToolValueSchemas = {
  navigate: v.strictObject({
    page: v.picklist(["dashboard", "issues", "agent", "members"]),
  }),
  openIssue: v.strictObject({
    issueNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  patchFormDraft: v.strictObject({
    expectedEpoch: formIdentifier,
    expectedRevision: issueRevision,
    formId: formIdentifier,
    patch: v.strictObject({
      description: v.optional(v.string()),
      title: v.optional(v.string()),
    }),
  }),
  readFormDraft: v.strictObject(formTarget),
  setIssueQuery: v.strictObject({ query: issueQuerySchema }),
}

export const agentClientToolSchemas = {
  navigate: toStandardJsonSchema(agentClientToolValueSchemas.navigate),
  openIssue: toStandardJsonSchema(agentClientToolValueSchemas.openIssue),
  patchFormDraft: toStandardJsonSchema(
    agentClientToolValueSchemas.patchFormDraft
  ),
  readFormDraft: toStandardJsonSchema(
    agentClientToolValueSchemas.readFormDraft
  ),
  setIssueQuery: toStandardJsonSchema(
    agentClientToolValueSchemas.setIssueQuery
  ),
}
