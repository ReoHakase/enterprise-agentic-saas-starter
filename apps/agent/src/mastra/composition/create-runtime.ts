import { Mastra } from "@mastra/core/mastra"
import type { MastraCompositeStore } from "@mastra/core/storage"

import type { createProductAgent } from "../agents/product-agent"
import type { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import type { createThreadTitleAgent } from "../agents/thread-title-agent"
import type { ApprovedIssueActionWorkflow } from "../workflows/approved-issue-action"

export type ProductRuntimeAgents = {
  productAgent: ReturnType<typeof createProductAgent>
  publicWebResearchAgent: ReturnType<typeof createPublicWebResearchAgent>
  threadTitleAgent: ReturnType<typeof createThreadTitleAgent>
}

export const createProductRuntime = ({
  productAgent,
  publicWebResearchAgent,
  threadTitleAgent,
  storage,
  approvedIssueActionWorkflow,
}: ProductRuntimeAgents & {
  storage: MastraCompositeStore
  approvedIssueActionWorkflow: ApprovedIssueActionWorkflow
  executionRegistry?: unknown
}) =>
  new Mastra({
    agents: { productAgent, publicWebResearchAgent, threadTitleAgent },
    // Provider errors can contain request bodies and response headers. Product
    // failures are reported through the scrubbed Sentry boundary instead.
    logger: false,
    storage,
    workflows: { approvedIssueActionWorkflow },
  })
