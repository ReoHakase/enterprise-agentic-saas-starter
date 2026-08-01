import { Mastra } from "@mastra/core/mastra"
import type { MastraCompositeStore } from "@mastra/core/storage"
import type { Observability } from "@mastra/observability"

import type { createProductAgent } from "../agents/product-agent"
import type { ApprovedIssueActionWorkflow } from "../workflows/approved-issue-action"

export type ProductRuntimeAgents = {
  productAgent: ReturnType<typeof createProductAgent>
}

export const createProductRuntime = ({
  productAgent,
  storage,
  approvedIssueActionWorkflow,
  observability,
}: ProductRuntimeAgents & {
  storage: MastraCompositeStore
  approvedIssueActionWorkflow: ApprovedIssueActionWorkflow
  observability?: Observability
  executionRegistry?: unknown
}) =>
  new Mastra({
    agents: { productAgent },
    logger: false,
    observability,
    storage,
    workflows: { approvedIssueActionWorkflow },
  })
