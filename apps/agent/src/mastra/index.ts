import { createAgentRuntimeComposition } from "./composition/runtime-composition"

const composition = createAgentRuntimeComposition(process.env, {
  allowUnscopedStudioModel: true,
})

export const {
  approvedIssueActionExecutionRegistry,
  approvedIssueActionWorkflow,
  executionRegistry,
  mastra,
  productAgent,
  productWebSearchTool,
  threadTitleAgent,
} = composition
