import * as v from "valibot"

const toolTitles: Record<string, string> = {
  add_issue_attachments: "Add attachments to Issue",
  create_issue: "Create Issue",
  delete_issue: "Delete Issue",
  get_issue: "View Issue",
  read_issue_attachment_image: "View attachment image",
  remove_issue_attachments: "Remove Issue attachments",
  read_account_context: "View account context",
  read_active_organization: "View organization",
  search_issue_labels: "Search labels",
  search_issues: "Search Issues",
  search_organization_members: "Search members",
  skill: "Load Agent instructions",
  ui_navigate: "Navigate",
  ui_open_issue: "Open Issue",
  ui_patch_form_draft: "Update form draft",
  ui_read_form_draft: "View form draft",
  ui_set_issue_query: "Update Issue filters",
  update_issue: "Update Issue",
  web_search: "Search the web",
}

type ToolPresentation = {
  title: string
  request?: string
  result?: string
}
type PresentationInput = {
  issueCount: number
  issueNumber?: number
  input: unknown
  output: unknown
  state: string
  toolName: string
}

const issueStatusLabels = {
  closed: "Closed",
  in_progress: "In progress",
  open: "Open",
} as const
const issuePriorityLabels = {
  high: "High",
  low: "Low",
  medium: "Medium",
  no_priority: "No priority",
  urgent: "Urgent",
} as const
const skillLabels = {
  core: "core instructions",
  "issue-triage": "Issue triage instructions",
  "issue-writing": "Issue writing instructions",
  "web-assistance": "web research instructions",
} as const
const searchIssuesInputSchema = v.object({
  label: v.optional(v.pipe(v.string(), v.maxLength(40))),
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50))
  ),
  priority: v.optional(
    v.picklist(["high", "low", "medium", "no_priority", "urgent"])
  ),
  search: v.optional(v.pipe(v.string(), v.maxLength(200))),
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
  status: v.optional(v.picklist(["closed", "in_progress", "open"])),
})
const issueNumberInputSchema = v.object({
  number: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})
const skillInputSchema = v.object({
  name: v.picklist(["core", "issue-triage", "issue-writing", "web-assistance"]),
})
const organizationOutputSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(200)),
})
const boundedQueryInputSchema = v.object({
  query: v.optional(v.pipe(v.string(), v.maxLength(200))),
})

const skillPresentation = ({ input, state }: PresentationInput) => {
  const parsed = v.safeParse(skillInputSchema, input)
  const label = parsed.success ? skillLabels[parsed.output.name] : undefined
  return {
    title: label ? `Load ${label}` : "Load Agent instructions",
    request: label ? `Instructions: ${label}` : undefined,
    result:
      state === "output-available" && label ? `Loaded ${label}` : undefined,
  }
}

const getIssuePresentation = ({
  input,
  issueCount,
  issueNumber,
  state,
}: PresentationInput) => {
  const parsed = v.safeParse(issueNumberInputSchema, input)
  const number =
    (parsed.success ? parsed.output.number : undefined) ?? issueNumber
  return {
    title: number ? `View Issue #${number}` : "View Issue",
    request: number ? `Target: Issue #${number}` : undefined,
    result:
      state === "output-available" && issueCount > 0
        ? `Result: ${issueCount} Issue${issueCount === 1 ? "" : "s"}`
        : undefined,
  }
}

const searchIssuesPresentation = ({
  input,
  issueCount,
  output,
  state,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(searchIssuesInputSchema, input)
  if (!parsed.success) return { title: "Search Issues" }
  const filters = [
    parsed.output.status ? issueStatusLabels[parsed.output.status] : undefined,
    parsed.output.priority
      ? issuePriorityLabels[parsed.output.priority]
      : undefined,
    parsed.output.label ? `label:${parsed.output.label}` : undefined,
    parsed.output.search ? `“${parsed.output.search}”` : undefined,
  ].filter((value): value is string => Boolean(value))
  const sort = parsed.output.sortBy
    ? `${parsed.output.sortBy} ${parsed.output.sortDirection ?? "asc"}`
    : undefined
  const request = [
    filters.length > 0
      ? `Filters: ${filters.join(" · ")}`
      : "Filters: All Issues",
    sort ? `Sort: ${sort}` : undefined,
    parsed.output.limit ? `Limit: ${parsed.output.limit}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ")
  const validResult = Array.isArray(output) && issueCount === output.length
  return {
    title:
      filters.length > 0
        ? `Search Issues · ${filters.join(" · ")}`
        : "Search Issues",
    request,
    result:
      state === "output-available" && validResult
        ? `Result: ${issueCount}`
        : undefined,
  }
}

const organizationPresentation = ({
  output,
  state,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(organizationOutputSchema, output)
  return {
    title: parsed.success
      ? `View ${parsed.output.name} organization`
      : "View organization",
    request: "Target: Current organization",
    result:
      state === "output-available" && parsed.success
        ? `Result: ${parsed.output.name}`
        : undefined,
  }
}

const directoryPresentation = ({
  input,
  output,
  state,
  toolName,
}: PresentationInput): ToolPresentation => {
  const parsed = v.safeParse(boundedQueryInputSchema, input)
  return {
    title: toolTitles[toolName] ?? "Run Agent tool",
    request:
      parsed.success && parsed.output.query
        ? `Query: “${parsed.output.query}”`
        : "Query: All",
    result:
      state === "output-available" && Array.isArray(output)
        ? `Result: ${output.length}`
        : undefined,
  }
}

export const toolPresentation = (
  input: PresentationInput
): ToolPresentation => {
  if (input.toolName === "skill") return skillPresentation(input)
  if (input.toolName === "get_issue") return getIssuePresentation(input)
  if (input.toolName === "search_issues") return searchIssuesPresentation(input)
  if (input.toolName === "read_active_organization")
    return organizationPresentation(input)
  if (
    input.toolName === "search_issue_labels" ||
    input.toolName === "search_organization_members"
  )
    return directoryPresentation(input)
  return { title: toolTitles[input.toolName] ?? "Run Agent tool" }
}
