import { createAgentRuntimeComposition } from "./composition/runtime-composition"

const composition = createAgentRuntimeComposition(process.env)

export const {
  approvedIssueActionExecutionRegistry,
  approvedIssueActionWorkflow,
  mastra,
  productAgent,
  productWebSearchTool,
  publicWebResearchAgent,
  threadTitleAgent,
} = composition
