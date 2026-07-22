import type {
  AgentIssue,
  AgentSearchIssuesInput,
} from "@enterprise-agentic-saas/api/agent-client"
import { tool } from "ai"
import { z } from "zod"

import type { AgentInternalGateway } from "../control-plane/client"
import { createAgentToolBudget, type AgentToolBudget } from "./budget"

type AgentReadApi = Pick<
  AgentInternalGateway,
  | "getIssue"
  | "readAccountContext"
  | "readActiveOrganization"
  | "searchIssueLabels"
  | "searchIssues"
  | "searchOrganizationMembers"
>

const DEFAULT_RESULT_LIMIT = 20
const MAX_RESULT_LIMIT = 50
const emptyInputSchema = z.object({}).strict()
const searchInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    query: z.string().trim().max(200).optional(),
  })
  .strict()
const labelSearchInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    query: z.string().trim().max(40).optional(),
  })
  .strict()
const issueSearchInputSchema = z
  .object({
    assigneeId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    label: z.string().trim().max(40).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_RESULT_LIMIT)
      .default(DEFAULT_RESULT_LIMIT),
    priority: z
      .enum(["no_priority", "low", "medium", "high", "urgent"])
      .optional(),
    search: z.string().trim().max(200).optional(),
    sortBy: z
      .enum([
        "number",
        "createdAt",
        "updatedAt",
        "dueDate",
        "priority",
        "status",
      ])
      .optional(),
    sortDirection: z.enum(["asc", "desc"]).optional(),
    status: z.enum(["open", "in_progress", "closed"]).optional(),
  })
  .strict()
const getIssueInputSchema = z.discriminatedUnion("lookup", [
  z
    .object({
      id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      lookup: z.literal("id"),
    })
    .strict(),
  z
    .object({
      lookup: z.literal("number"),
      number: z.number().int().positive().max(2_147_483_647),
    })
    .strict(),
])

export const agentReadToolSchemas = {
  empty: emptyInputSchema,
  getIssue: getIssueInputSchema,
  issueSearch: issueSearchInputSchema,
  labelSearch: labelSearchInputSchema,
  memberSearch: searchInputSchema,
}

const boundedText = (value: string, maximumLength: number): string =>
  value.length <= maximumLength ? value : `${value.slice(0, maximumLength)}…`

const boundedIssue = (
  issue: AgentIssue,
  descriptionLimit: number
): AgentIssue => ({
  ...issue,
  description: boundedText(issue.description, descriptionLimit),
  title: boundedText(issue.title, 200),
})

const safeRead = async <Result>(
  operation: () => Promise<Result>
): Promise<Result> => {
  try {
    return await operation()
  } catch {
    throw new Error("Agent read capability is unavailable")
  }
}

export const createAgentReadHandlers = (
  api: AgentReadApi,
  runGrant: string,
  budget: AgentToolBudget = createAgentToolBudget()
) => {
  const invoke = async <Result>(
    operation: () => Promise<Result>
  ): Promise<Result> => {
    budget.consume("read")
    return safeRead(operation)
  }

  return {
    getIssue: (input: z.infer<typeof getIssueInputSchema>) =>
      invoke(async () =>
        boundedIssue(await api.getIssue({ grant: runGrant, ...input }), 20_000)
      ),
    readAccountContext: () =>
      invoke(() => api.readAccountContext({ grant: runGrant })),
    readActiveOrganization: () =>
      invoke(() => api.readActiveOrganization({ grant: runGrant })),
    searchIssueLabels: (input: z.infer<typeof labelSearchInputSchema>) =>
      invoke(() =>
        api.searchIssueLabels({
          grant: runGrant,
          limit: input.limit,
          query: input.query,
        })
      ),
    searchIssues: (input: z.infer<typeof issueSearchInputSchema>) =>
      invoke(async () => {
        const searchInput: AgentSearchIssuesInput = {
          ...input,
          grant: runGrant,
        }
        const issues = await api.searchIssues(searchInput)
        return issues.map((issue) => boundedIssue(issue, 2_000))
      }),
    searchOrganizationMembers: (input: z.infer<typeof searchInputSchema>) =>
      invoke(() =>
        api.searchOrganizationMembers({
          grant: runGrant,
          limit: input.limit,
          query: input.query,
        })
      ),
  }
}

export const createAgentReadTools = (
  api: AgentReadApi,
  runGrant: string,
  budget: AgentToolBudget = createAgentToolBudget()
) => {
  const handlers = createAgentReadHandlers(api, runGrant, budget)

  return {
    get_issue: tool({
      description:
        "Read one Issue in the active organization by opaque ID or Issue number.",
      execute: handlers.getIssue,
      inputSchema: getIssueInputSchema,
      strict: true,
    }),
    read_account_context: tool({
      description:
        "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
      execute: handlers.readAccountContext,
      inputSchema: emptyInputSchema,
      strict: true,
    }),
    read_active_organization: tool({
      description:
        "Read the active organization's allowlisted name, role, and Issue permissions without changing it.",
      execute: handlers.readActiveOrganization,
      inputSchema: emptyInputSchema,
      strict: true,
    }),
    search_issue_labels: tool({
      description:
        "Search bounded label candidates from Issues in the active organization.",
      execute: handlers.searchIssueLabels,
      inputSchema: labelSearchInputSchema,
      strict: true,
    }),
    search_issues: tool({
      description:
        "Search a bounded, stable first page of Issues in the active organization using typed filters.",
      execute: handlers.searchIssues,
      inputSchema: issueSearchInputSchema,
      strict: true,
    }),
    search_organization_members: tool({
      description:
        "Search a bounded list of members in the active organization. Email and credentials are never returned.",
      execute: handlers.searchOrganizationMembers,
      inputSchema: searchInputSchema,
      strict: true,
    }),
  }
}
