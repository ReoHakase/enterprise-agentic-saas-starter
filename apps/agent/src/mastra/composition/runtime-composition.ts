import { createAgentStorage } from "../storage"
import {
  ApprovedIssueActionExecutionRegistry,
  createApprovedIssueActionWorkflow,
} from "../workflows/approved-issue-action"
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
  return {
    ...agents,
    approvedIssueActionExecutionRegistry,
    approvedIssueActionWorkflow,
    mastra: createProductRuntime({
      ...agents,
      approvedIssueActionWorkflow,
      storage,
    }),
    storage,
  }
}
