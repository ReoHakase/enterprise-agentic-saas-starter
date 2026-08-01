import { Observability } from "@mastra/observability"
import { OtelBridge } from "@mastra/otel-bridge"

import { AgentTraceErrorNormalizer } from "../adapters/telemetry/trace-error-normalizer"
import { createAgentStorage } from "../storage"
import {
  ApprovedIssueActionExecutionRegistry,
  createApprovedIssueActionResumeRuntime,
  createApprovedIssueActionWorkflow,
} from "../workflows/approved-issue-action"
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
  const sessionId = environment.DEV_SESSION_ID?.trim()
  const worktreeId = environment.DEV_WORKTREE_ID?.trim()
  const observability =
    environment.NODE_ENV === "development" &&
    environment.OTEL_EXPORTER_OTLP_ENDPOINT === "http://127.0.0.1:4318" &&
    sessionId &&
    worktreeId
      ? new Observability({
          configs: {
            default: {
              bridge: new OtelBridge(),
              logging: { enabled: false },
              serviceName: "enterprise-agentic-saas-agent",
              spanOutputProcessors: [new AgentTraceErrorNormalizer()],
            },
          },
          sensitiveDataFilter: {
            sensitiveFields: [
              "apiKey",
              "auth",
              "authorization",
              "authorizationCode",
              "bearer",
              "clientSecret",
              "connectionTicket",
              "cookie",
              "credential",
              "jwt",
              "password",
              "privateKey",
              "refreshToken",
              "runGrant",
              "secret",
              "setCookie",
              "ticket",
              "token",
              "verificationCode",
            ],
          },
        })
      : undefined
  return {
    ...agents,
    approvedIssueActionExecutionRegistry,
    approvedIssueActionWorkflow,
    createApprovalResumeRuntime: () =>
      createApprovedIssueActionResumeRuntime(storage),
    mastra: createProductRuntime({
      ...agents,
      approvedIssueActionWorkflow,
      observability,
      storage,
    }),
    storage,
  }
}
