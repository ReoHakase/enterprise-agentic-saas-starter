import * as v from "valibot"

import {
  buildIssueListHref,
  type IssueSearchState,
  withAgentThreadHref,
} from "@/features/issues"

import type {
  AgentFormSnapshot,
  AgentIssueFormValues,
} from "./components/form-registry"

const boundedString = (maximum: number) =>
  v.pipe(v.string(), v.maxLength(maximum))
const issueRevisionSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
const formTargetEntries = {
  formId: v.optional(boundedString(128)),
  expectedEpoch: v.optional(boundedString(128)),
  expectedRevision: v.optional(issueRevisionSchema),
}
const issueQuerySchema = v.strictObject({
  q: v.optional(boundedString(200)),
  status: v.optional(v.picklist(["all", "open", "in_progress", "closed"])),
  priority: v.optional(
    v.picklist(["all", "no_priority", "low", "medium", "high", "urgent"])
  ),
  assignee: v.optional(boundedString(128)),
  label: v.optional(boundedString(40)),
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
  dir: v.optional(v.picklist(["asc", "desc"])),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100_000))
  ),
})

const clientToolSchemas = {
  ui_navigate: v.strictObject({
    page: v.picklist(["dashboard", "issues", "agent", "members"]),
  }),
  ui_set_issue_query: v.strictObject({ query: issueQuerySchema }),
  ui_open_issue: v.strictObject({
    issueNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  ui_read_form_draft: v.strictObject(formTargetEntries),
  ui_patch_form_draft: v.strictObject({
    formId: boundedString(128),
    expectedEpoch: boundedString(128),
    expectedRevision: issueRevisionSchema,
    patch: v.strictObject({
      title: v.optional(v.string()),
      description: v.optional(v.string()),
    }),
  }),
} as const

type AgentClientToolName = keyof typeof clientToolSchemas

type ClientToolDependencies = {
  organizationId: string
  organizationSlug: string
  frozen: boolean
  navigate: (href: string) => void
  issueSearchState: IssueSearchState
  readForm: (target: {
    organizationId: string
    formId?: string
    expectedEpoch?: string
    expectedRevision?: number
  }) => AgentFormSnapshot
  patchForm: (
    target: {
      organizationId: string
      formId: string
      expectedEpoch: string
      expectedRevision: number
    },
    patch: AgentIssueFormValues
  ) => Promise<AgentFormSnapshot>
}

const deferNavigation = (
  navigate: ClientToolDependencies["navigate"],
  href: string
) => {
  setTimeout(() => navigate(href), 0)
}

const parseToolInput = <Name extends AgentClientToolName>(
  name: Name,
  input: unknown
) => {
  const result = v.safeParse(clientToolSchemas[name], input)
  if (!result.success) throw new Error(`Invalid input for ${name}.`)
  return result.output
}

export const executeAgentClientTool = async (
  toolName: string,
  input: unknown,
  dependencies: ClientToolDependencies
): Promise<unknown> => {
  if (dependencies.frozen)
    throw new Error("Organization switching is in progress.")
  if (!(toolName in clientToolSchemas))
    throw new Error("Client tool is not allowlisted.")

  if (toolName === "ui_navigate") {
    const parsed = parseToolInput(toolName, input)
    deferNavigation(
      dependencies.navigate,
      withAgentThreadHref(
        `/organization/${dependencies.organizationSlug}/${parsed.page}`,
        dependencies.issueSearchState.agentThread
      )
    )
    return { ok: true }
  }
  if (toolName === "ui_set_issue_query") {
    const parsed = parseToolInput(toolName, input)
    const target = buildIssueListHref(
      dependencies.organizationSlug,
      dependencies.issueSearchState,
      parsed.query
    )
    const { agentThread: _agentThread, ...publicQuery } = target.state
    deferNavigation(dependencies.navigate, target.href)
    return { ok: true, query: publicQuery }
  }
  if (toolName === "ui_open_issue") {
    const parsed = parseToolInput(toolName, input)
    deferNavigation(
      dependencies.navigate,
      withAgentThreadHref(
        `/organization/${dependencies.organizationSlug}/issues/${parsed.issueNumber.toString()}`,
        dependencies.issueSearchState.agentThread
      )
    )
    return { ok: true }
  }
  if (toolName === "ui_read_form_draft") {
    const parsed = parseToolInput(toolName, input)
    return dependencies.readForm({
      organizationId: dependencies.organizationId,
      ...parsed,
    })
  }

  const parsed = parseToolInput("ui_patch_form_draft", input)
  return dependencies.patchForm(
    {
      organizationId: dependencies.organizationId,
      formId: parsed.formId,
      expectedEpoch: parsed.expectedEpoch,
      expectedRevision: parsed.expectedRevision,
    },
    parsed.patch
  )
}
