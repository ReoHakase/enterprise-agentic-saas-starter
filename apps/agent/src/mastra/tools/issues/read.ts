import { createTool } from "@mastra/core/tools"

import {
  agentReadToolSchemas,
  createAgentReadHandlers,
} from "../../../read-tools"
import {
  getProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../../runtime-context"

const readToolMetadata = {
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  },
}

export const issueReadTools = {
  get_issue: createTool<
    "get_issue",
    typeof agentReadToolSchemas.getIssue,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "get_issue",
    description:
      "Read one Issue in the active organization by opaque ID or Issue number.",
    inputSchema: agentReadToolSchemas.getIssue,
    strict: true,
    mcp: readToolMetadata,
    execute: (input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).getIssue(input)
    },
  }),
  read_account_context: createTool<
    "read_account_context",
    typeof agentReadToolSchemas.empty,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "read_account_context",
    description:
      "Read the current user's allowlisted display profile. This never returns credentials or account settings.",
    inputSchema: agentReadToolSchemas.empty,
    strict: true,
    mcp: readToolMetadata,
    execute: (_input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).readAccountContext()
    },
  }),
  read_active_organization: createTool<
    "read_active_organization",
    typeof agentReadToolSchemas.empty,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "read_active_organization",
    description:
      "Read the active organization's allowlisted name, role, and Issue permissions without changing it.",
    inputSchema: agentReadToolSchemas.empty,
    strict: true,
    mcp: readToolMetadata,
    execute: (_input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).readActiveOrganization()
    },
  }),
  search_issue_labels: createTool<
    "search_issue_labels",
    typeof agentReadToolSchemas.labelSearch,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "search_issue_labels",
    description:
      "Search bounded label candidates from Issues in the active organization.",
    inputSchema: agentReadToolSchemas.labelSearch,
    strict: true,
    mcp: readToolMetadata,
    execute: (input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).searchIssueLabels(input)
    },
  }),
  search_issues: createTool<
    "search_issues",
    typeof agentReadToolSchemas.issueSearch,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "search_issues",
    description:
      "Search a bounded, stable first page of Issues in the active organization using typed filters.",
    inputSchema: agentReadToolSchemas.issueSearch,
    strict: true,
    mcp: readToolMetadata,
    execute: (input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).searchIssues(input)
    },
  }),
  search_organization_members: createTool<
    "search_organization_members",
    typeof agentReadToolSchemas.memberSearch,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "search_organization_members",
    description:
      "Search a bounded list of members in the active organization. Email and credentials are never returned.",
    inputSchema: agentReadToolSchemas.memberSearch,
    strict: true,
    mcp: readToolMetadata,
    execute: (input, context) => {
      const runtime = getProductAgentRuntime(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).searchOrganizationMembers(input)
    },
  }),
}
