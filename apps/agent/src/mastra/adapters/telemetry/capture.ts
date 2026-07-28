import { captureException } from "@sentry/cloudflare"

export type AgentFailureCode =
  | "image_failed"
  | "memory_commit_deferred"
  | "model_failed"
  | "resume_failed"
  | "run_grant_invalid"
  | "run_start_failed"
  | "title_failed"
  | "usage_record_failed"

const failureMessages: Record<AgentFailureCode, string> = {
  image_failed: "Agent image preparation failed",
  memory_commit_deferred: "Agent memory commit deferred",
  model_failed: "Agent model response failed",
  resume_failed: "Agent action resume failed",
  run_grant_invalid: "Agent run grant validation failed",
  run_start_failed: "Agent run start failed",
  title_failed: "Agent thread title generation failed",
  usage_record_failed: "Agent usage recording failed",
}

export const captureAgentFailure = (code: AgentFailureCode): void => {
  captureException(new Error(failureMessages[code]), {
    tags: { component: "agent-worker", errorCode: code },
  })
}
