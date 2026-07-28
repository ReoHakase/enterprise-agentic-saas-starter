import { Mastra } from "@mastra/core/mastra"
import type { MastraCompositeStore } from "@mastra/core/storage"

import type { createProductAgent } from "../agents/product-agent"
import type { createThreadTitleAgent } from "../agents/thread-title-agent"
import type { ApprovedIssueActionWorkflow } from "../workflows/approved-issue-action"
import type { MemoryCommitWorkflow } from "../workflows/memory-commit"

export type ProductRuntimeAgents = {
  productAgent: ReturnType<typeof createProductAgent>
  threadTitleAgent: ReturnType<typeof createThreadTitleAgent>
}

export const createProductRuntime = ({
  productAgent,
  threadTitleAgent,
  storage,
  approvedIssueActionWorkflow,
  memoryCommitWorkflow,
}: ProductRuntimeAgents & {
  storage: MastraCompositeStore
  approvedIssueActionWorkflow: ApprovedIssueActionWorkflow
  memoryCommitWorkflow: MemoryCommitWorkflow
  executionRegistry?: unknown
}) =>
  new Mastra({
    agents: { productAgent, threadTitleAgent },
    // Provider errors can contain request bodies and response headers. Product
    // failures are reported through the scrubbed Sentry boundary instead.
    logger: false,
    storage,
    workflows: { approvedIssueActionWorkflow, memoryCommitWorkflow },
  })
