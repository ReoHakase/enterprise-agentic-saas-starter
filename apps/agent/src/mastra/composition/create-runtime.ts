import { Mastra } from "@mastra/core/mastra"
import type { MastraCompositeStore } from "@mastra/core/storage"
import type { Observability } from "@mastra/observability"

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
  observability,
}: ProductRuntimeAgents & {
  storage: MastraCompositeStore
  approvedIssueActionWorkflow: ApprovedIssueActionWorkflow
  memoryCommitWorkflow: MemoryCommitWorkflow
  observability?: Observability
  executionRegistry?: unknown
}) =>
  new Mastra({
    agents: { productAgent, threadTitleAgent },
    observability,
    storage,
    workflows: { approvedIssueActionWorkflow, memoryCommitWorkflow },
  })
