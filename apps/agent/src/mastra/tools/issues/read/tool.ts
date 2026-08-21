import {
  type ProductAgentExecutionResolver,
  type ProductAgentRequestContext,
} from "../../../runtime/request-context"
import {
  createAgentIssueImageHandler,
  createAgentReadHandlers,
  issueAttachmentImageToModelOutput,
} from "./execute"
import {
  createGetIssueTool,
  createReadIssueAttachmentImageTool,
  createReadAccountContextTool,
  createReadActiveOrganizationTool,
  createSearchIssueLabelsTool,
  createSearchIssuesTool,
  createSearchOrganizationMembersTool,
} from "./factories"

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
  read_issue_attachment_image:
    createReadIssueAttachmentImageTool<ProductAgentRequestContext>(
      (input, context) => {
        const runtime = resolveExecution(context.requestContext)
        return createAgentIssueImageHandler(
          runtime.api,
          runtime.runGrant,
          runtime.budget,
          runtime.visionBudget
        )(input)
      },
      issueAttachmentImageToModelOutput
    ),
})
