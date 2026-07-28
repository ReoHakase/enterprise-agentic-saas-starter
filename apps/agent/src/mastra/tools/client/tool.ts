import { createTool } from "@mastra/core/tools"

import type { AgentToolBudget } from "../../core/budget/tool"
import { agentClientToolSchemas } from "./schema"

const countClientTool = (budget: AgentToolBudget) => () =>
  budget.consume("client")

export const createAgentClientTools = (budget: AgentToolBudget) => ({
  ui_navigate: createTool({
    id: "ui_navigate",
    description:
      "Navigate to one allowlisted page in the current active organization.",
    inputSchema: agentClientToolSchemas.navigate,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_open_issue: createTool({
    id: "ui_open_issue",
    description:
      "Open one Issue by number using the current organization's canonical route.",
    inputSchema: agentClientToolSchemas.openIssue,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_patch_form_draft: createTool({
    id: "ui_patch_form_draft",
    description:
      "Patch allowlisted fields of a previously read Issue form draft using its exact form ID, epoch, and revision, without submitting it.",
    inputSchema: agentClientToolSchemas.patchFormDraft,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_read_form_draft: createTool({
    id: "ui_read_form_draft",
    description:
      "Read allowlisted fields of the currently mounted Issue form draft.",
    inputSchema: agentClientToolSchemas.readFormDraft,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
  ui_set_issue_query: createTool({
    id: "ui_set_issue_query",
    description:
      "Update the Issue table's typed URL query state in the current organization.",
    inputSchema: agentClientToolSchemas.setIssueQuery,
    onInputAvailable: countClientTool(budget),
    strict: true,
  }),
})
