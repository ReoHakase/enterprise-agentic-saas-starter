import { Mastra } from "@mastra/core/mastra"
import { InMemoryStore } from "@mastra/core/storage"

import type { createProductAgent } from "../agents/product-agent"
import type { createPublicWebResearchAgent } from "../agents/public-web-research-agent"
import type { createThreadTitleAgent } from "../agents/thread-title-agent"
import { approvedIssueActionWorkflow } from "../workflows/approved-issue-action"

export type ProductRuntimeAgents = {
  productAgent: ReturnType<typeof createProductAgent>
  publicWebResearchAgent: ReturnType<typeof createPublicWebResearchAgent>
  threadTitleAgent: ReturnType<typeof createThreadTitleAgent>
}

export const createProductRuntime = ({
  productAgent,
  publicWebResearchAgent,
  threadTitleAgent,
}: ProductRuntimeAgents) =>
  new Mastra({
    agents: { productAgent, publicWebResearchAgent, threadTitleAgent },
    // Provider errors can contain request bodies and response headers. Product
    // failures are reported through the scrubbed Sentry boundary instead.
    logger: false,
    // Workflow execution snapshots are intentionally ephemeral. API/Turso
    // remains canonical for threads, actions, approvals, and usage.
    storage: new InMemoryStore({ id: "agent-ephemeral-execution" }),
    workflows: { approvedIssueActionWorkflow },
  })
