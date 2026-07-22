import { Mastra } from "@mastra/core/mastra"

import { productAgent } from "./agents/product-agent"
import { publicWebResearchAgent } from "./agents/public-web-research-agent"
import { approvedIssueActionWorkflow } from "./workflows/approved-issue-action"

export { approvedIssueActionWorkflow, productAgent, publicWebResearchAgent }

export const mastra = new Mastra({
  agents: { productAgent, publicWebResearchAgent },
  workflows: { approvedIssueActionWorkflow },
})
