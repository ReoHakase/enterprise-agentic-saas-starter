import { createAgentStorage } from "../storage"
import {
  ApprovedIssueActionExecutionRegistry,
  createApprovedIssueActionResumeRuntime,
  createApprovedIssueActionWorkflow,
} from "../workflows/approved-issue-action"
import { createMemoryCommitWorkflow } from "../workflows/memory-commit"
import { createProductAgentComposition } from "./create-product-agent"
import { createProductRuntime } from "./create-runtime"
import type { PortableAgentRuntimeEnv } from "./environment"

type AgentRuntimeCompositionOptions = {
  allowUnscopedStudioModel?: boolean
}

export const createAgentRuntimeComposition = (
  environment: PortableAgentRuntimeEnv | NodeJS.ProcessEnv,
  { allowUnscopedStudioModel = false }: AgentRuntimeCompositionOptions = {}
) => {
  const storage = createAgentStorage(environment)
  const agents = createProductAgentComposition(environment, storage, {
    allowUnscopedModel: allowUnscopedStudioModel,
  })
  const approvedIssueActionExecutionRegistry =
    new ApprovedIssueActionExecutionRegistry()
  const approvedIssueActionWorkflow = createApprovedIssueActionWorkflow(
    approvedIssueActionExecutionRegistry
  )
  const memoryCommitWorkflow = createMemoryCommitWorkflow(agents.memory)
  return {
    ...agents,
    approvedIssueActionExecutionRegistry,
    approvedIssueActionWorkflow,
    createApprovalResumeRuntime: () =>
      createApprovedIssueActionResumeRuntime(storage),
    memoryCommitWorkflow,
    mastra: createProductRuntime({
      ...agents,
      approvedIssueActionWorkflow,
      memoryCommitWorkflow,
      storage,
    }),
    storage,
  }
}
