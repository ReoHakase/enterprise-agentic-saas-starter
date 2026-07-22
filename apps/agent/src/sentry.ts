import * as Sentry from "@sentry/cloudflare"

export type AgentFailureCode =
  | "image_failed"
  | "model_failed"
  | "resume_failed"
  | "run_grant_invalid"
  | "run_start_failed"

const failureMessages: Record<AgentFailureCode, string> = {
  image_failed: "Agent image preparation failed",
  model_failed: "Agent model response failed",
  resume_failed: "Agent action resume failed",
  run_grant_invalid: "Agent run grant validation failed",
  run_start_failed: "Agent run start failed",
}

export const captureAgentFailure = (code: AgentFailureCode): void => {
  Sentry.captureException(new Error(failureMessages[code]), {
    tags: { component: "agent-worker", errorCode: code },
  })
}
