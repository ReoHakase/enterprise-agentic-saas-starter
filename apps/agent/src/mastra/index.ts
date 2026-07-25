import {
  productAgent,
  productWebSearchTool,
  publicWebResearchAgent,
  threadTitleAgent,
} from "./composition/create-product-agent"
import { createProductRuntime } from "./composition/create-runtime"
import { approvedIssueActionWorkflow } from "./workflows/approved-issue-action"

export {
  approvedIssueActionWorkflow,
  productAgent,
  productWebSearchTool,
  publicWebResearchAgent,
  threadTitleAgent,
}

export const mastra = createProductRuntime({
  productAgent,
  publicWebResearchAgent,
  threadTitleAgent,
})
