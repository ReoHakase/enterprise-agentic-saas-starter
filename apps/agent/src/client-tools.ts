import { tool } from "ai"
import { z } from "zod"

import type { AgentToolBudget } from "./tool-budget"

const boundedString = (maximum: number) => z.string().max(maximum)
const formIdentifier = z.string().min(1).max(128)
const formTarget = {
  expectedEpoch: formIdentifier.optional(),
  expectedRevision: z.number().int().min(1).optional(),
  formId: formIdentifier.optional(),
}

const issueQuerySchema = z
  .object({
    assignee: boundedString(128).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
    label: boundedString(40).optional(),
    page: z.number().int().min(1).max(100_000).optional(),
    priority: z
      .enum(["all", "no_priority", "low", "medium", "high", "urgent"])
      .optional(),
    q: boundedString(200).optional(),
    sort: z
      .enum([
        "number",
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
      ])
      .optional(),
    status: z.enum(["all", "open", "in_progress", "closed"]).optional(),
  })
  .strict()

export const agentClientToolSchemas = {
  navigate: z
    .object({ page: z.enum(["dashboard", "issues", "agent", "members"]) })
    .strict(),
  openIssue: z.object({ issueNumber: z.number().int().min(1) }).strict(),
  patchFormDraft: z
    .object({
      expectedEpoch: formIdentifier,
      expectedRevision: formTarget.expectedRevision,
      formId: formIdentifier,
      patch: z
        .object({
          description: z.string().optional(),
          title: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  readFormDraft: z.object(formTarget).strict(),
  setIssueQuery: z.object({ query: issueQuerySchema }).strict(),
}

const countClientTool = (budget: AgentToolBudget) => () =>
  budget.consume("client")

export const createAgentClientTools = (budget: AgentToolBudget) => ({
  ui_navigate: tool({
    description:
      "Navigate to one allowlisted page in the current active organization.",
    inputSchema: agentClientToolSchemas.navigate,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_open_issue: tool({
    description:
      "Open one Issue by number using the current organization's canonical route.",
    inputSchema: agentClientToolSchemas.openIssue,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_patch_form_draft: tool({
    description:
      "Patch allowlisted fields of a previously read Issue form draft using its exact form ID and epoch, without submitting it.",
    inputSchema: agentClientToolSchemas.patchFormDraft,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_read_form_draft: tool({
    description:
      "Read allowlisted fields of the currently mounted Issue form draft.",
    inputSchema: agentClientToolSchemas.readFormDraft,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_set_issue_query: tool({
    description:
      "Update the Issue table's typed URL query state in the current organization.",
    inputSchema: agentClientToolSchemas.setIssueQuery,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
})
