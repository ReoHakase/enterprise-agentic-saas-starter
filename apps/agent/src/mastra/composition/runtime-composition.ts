import { createAgentStorage } from "../storage"
import {
  ApprovedIssueActionExecutionRegistry,
  createApprovedIssueActionWorkflow,
} from "../workflows/approved-issue-action"
import { createMemoryCommitWorkflow } from "../workflows/memory-commit"
import { createProductAgentComposition } from "./create-product-agent"
import { createProductRuntime } from "./create-runtime"
import type { PortableAgentRuntimeEnv } from "./environment"

export const createAgentRuntimeComposition = (
  environment: PortableAgentRuntimeEnv | NodeJS.ProcessEnv
) => {
  const storage = createAgentStorage(environment)
  const agents = createProductAgentComposition(environment, storage)
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
