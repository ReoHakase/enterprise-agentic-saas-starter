import {
  createGetIssueTool,
  createReadAccountContextTool,
  createReadActiveOrganizationTool,
  createSearchIssueLabelsTool,
  createSearchIssuesTool,
  createSearchOrganizationMembersTool,
} from "@enterprise-agentic-saas/agent-tools"
import { createTool } from "@mastra/core/tools"

import {
  type ProductAgentExecutionResolver,
  type ProductAgentRequestContext,
} from "../../../runtime/request-context"
import {
  createAgentIssueImageHandler,
  createAgentReadHandlers,
  issueAttachmentImageToModelOutput,
} from "./execute"
import { issueAttachmentImageInputSchema } from "./schema"

const readToolMetadata = {
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  },
}

export const createIssueReadTools = (
  resolveExecution: ProductAgentExecutionResolver
) => ({
  get_issue: createGetIssueTool<ProductAgentRequestContext>(
    (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).getIssue(input)
    }
  ),
  read_account_context:
    createReadAccountContextTool<ProductAgentRequestContext>(
      (_input, context) => {
        const runtime = resolveExecution(context.requestContext)
        return createAgentReadHandlers(
          runtime.api,
          runtime.runGrant,
          runtime.budget
        ).readAccountContext()
      }
    ),
  read_active_organization:
    createReadActiveOrganizationTool<ProductAgentRequestContext>(
      (_input, context) => {
        const runtime = resolveExecution(context.requestContext)
        return createAgentReadHandlers(
          runtime.api,
          runtime.runGrant,
          runtime.budget
        ).readActiveOrganization()
      }
    ),
  search_issue_labels: createSearchIssueLabelsTool<ProductAgentRequestContext>(
    (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).searchIssueLabels(input)
    }
  ),
  search_issues: createSearchIssuesTool<ProductAgentRequestContext>(
    (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      return createAgentReadHandlers(
        runtime.api,
        runtime.runGrant,
        runtime.budget
      ).searchIssues(input)
    }
  ),
  search_organization_members:
    createSearchOrganizationMembersTool<ProductAgentRequestContext>(
      (input, context) => {
        const runtime = resolveExecution(context.requestContext)
        return createAgentReadHandlers(
          runtime.api,
          runtime.runGrant,
          runtime.budget
        ).searchOrganizationMembers(input)
      }
    ),
})

export const createIssueVisionTools = (
  resolveExecution: ProductAgentExecutionResolver
) => ({
  read_issue_attachment_image: createTool<
    "read_issue_attachment_image",
    typeof issueAttachmentImageInputSchema,
    undefined,
    undefined,
    undefined,
    ProductAgentRequestContext
  >({
    id: "read_issue_attachment_image",
    description:
      "Read one supported JPEG, PNG, WebP, or GIF attachment from an Issue when its visual contents are needed. Call get_issue first and use only an attachment marked imageReadable.",
    inputSchema: issueAttachmentImageInputSchema,
    strict: true,
    mcp: readToolMetadata,
    execute: (input, context) => {
      const runtime = resolveExecution(context.requestContext)
      return createAgentIssueImageHandler(
        runtime.api,
        runtime.runGrant,
        runtime.budget,
        runtime.visionBudget
      )(input)
    },
    // output schema validationはobjectをcloneし得るため、WeakMap keyの同一性を
    // 維持するこのtoolではhandler内のclosed result constructionを正本にする。
    toModelOutput: issueAttachmentImageToModelOutput,
  }),
})
