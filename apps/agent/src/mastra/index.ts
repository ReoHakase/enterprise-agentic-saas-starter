import { Mastra } from "@mastra/core/mastra"
import { InMemoryStore } from "@mastra/core/storage"

import { productAgent } from "./agents/product-agent"
import { publicWebResearchAgent } from "./agents/public-web-research-agent"
import { approvedIssueActionWorkflow } from "./workflows/approved-issue-action"

export { approvedIssueActionWorkflow, productAgent, publicWebResearchAgent }

export const mastra = new Mastra({
  agents: { productAgent, publicWebResearchAgent },
  // Provider errors can contain request bodies and response headers. Product
  // failures are reported through the scrubbed Sentry boundary instead.
  logger: false,
  // Workflow execution snapshots are intentionally ephemeral. API/Turso remains
  // the canonical source for threads, actions, approvals, and usage.
  storage: new InMemoryStore({ id: "agent-ephemeral-execution" }),
  workflows: { approvedIssueActionWorkflow },
})
