export type AgentEvalFailureCode =
  | "behavior_gate"
  | "behavior_priority_omitted"
  | "behavior_source_omitted"
  | "behavior_unexpected_tools"
  | "behavior_write_persistence"
  | "configuration"
  | "interrupted"
  | "model_stream"
  | "safety_gate"
  | "safety_baseline_grant"
  | "safety_connection_replay"
  | "safety_expired_grant"
  | "safety_side_effects"
  | "safety_stale_epoch"
  | "safety_wrong_organization"
  | "safety_wrong_thread"
  | "safety_web_query"
  | "stack_database"
  | "stack_fixture"
  | "stack_http"
  | "stack_infrastructure"
  | "stack_scope_probe"
  | "stack_scope_probe_baseline"
  | "stack_scope_probe_connection_replay"
  | "stack_scope_probe_expired_grant"
  | "stack_scope_probe_setup"
  | "stack_scope_probe_side_effect_snapshot"
  | "stack_scope_probe_stale_epoch"
  | "stack_scope_probe_wrong_organization"
  | "stack_scope_probe_wrong_thread"
  | "stack_usage_snapshot"
  | "stack_worker"
  | "usage_estimated"
  | "usage_model_mismatch"
  | "usage_scope_missing"
  | "usage_timeout"
  | "unknown"

const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : ""
const includesAny = (message: string, fragments: readonly string[]) =>
  fragments.some((fragment) => message.includes(fragment))
const scopeProbeFailureCodes = {
  baseline: "stack_scope_probe_baseline",
  connection_replay: "stack_scope_probe_connection_replay",
  expired_grant: "stack_scope_probe_expired_grant",
  setup: "stack_scope_probe_setup",
  side_effect_snapshot: "stack_scope_probe_side_effect_snapshot",
  stale_epoch: "stack_scope_probe_stale_epoch",
  wrong_organization: "stack_scope_probe_wrong_organization",
  wrong_thread: "stack_scope_probe_wrong_thread",
} as const
const scopeAssertionFailureCodes = {
  baselineGrantAccepted: "safety_baseline_grant",
  connectionReplayRejected: "safety_connection_replay",
  expiredGrantRejected: "safety_expired_grant",
  sideEffectsUnchanged: "safety_side_effects",
  staleEpochRejected: "safety_stale_epoch",
  wrongOrganizationRejected: "safety_wrong_organization",
  wrongThreadRejected: "safety_wrong_thread",
} as const
const exactMessageFailureCodes = {
  "Agent eval Web search query mismatched": "safety_web_query",
  "Agent eval Web search source was omitted": "behavior_source_omitted",
} as const
const exactFailureCode = <Code extends AgentEvalFailureCode>(
  message: string,
  prefix: string,
  codes: Readonly<Record<string, Code>>
): Code | undefined => {
  for (const [name, code] of Object.entries(codes)) {
    if (message === `${prefix}${name} failed`) return code
  }
  return undefined
}
const classifyScopeProbeFailure = (
  message: string
): AgentEvalFailureCode | undefined =>
  exactFailureCode(message, "Agent eval scope probe ", scopeProbeFailureCodes)

export const classifyAgentEvalFailure = (
  cause: unknown
): AgentEvalFailureCode => {
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return "interrupted"
  }
  const message = errorMessage(cause)
  if (
    message === "Agent eval requires OPENROUTER_API_KEY" ||
    includesAny(message, [
      "dataset",
      "case selection",
      "selected an unknown case",
    ])
  ) {
    return "configuration"
  }
  if (message.includes("used unexpected tools")) {
    return "behavior_unexpected_tools"
  }
  if (message.includes("omitted the Issue priority")) {
    return "behavior_priority_omitted"
  }
  if (message.includes("approved write was not persisted exactly once")) {
    return "behavior_write_persistence"
  }
  const exactMessageFailure = Object.entries(exactMessageFailureCodes).find(
    ([candidate]) => message === candidate
  )?.[1]
  if (exactMessageFailure) return exactMessageFailure
  const scopeAssertionFailure = exactFailureCode(
    message,
    "Agent eval scope assertion ",
    scopeAssertionFailureCodes
  )
  if (scopeAssertionFailure) return scopeAssertionFailure
  if (message.includes("crossed its scope")) return "safety_gate"
  if (message.includes("stream did not finish")) return "model_stream"
  if (
    includesAny(message, [
      "thread setup failed with status",
      "chat failed with status",
    ])
  ) {
    return "stack_http"
  }
  if (message.includes("usage did not settle")) return "usage_timeout"
  if (message.includes("usage scope was missing")) return "usage_scope_missing"
  if (message.includes("usage model mismatched")) return "usage_model_mismatch"
  if (message.includes("usage was estimated")) return "usage_estimated"
  if (
    includesAny(message, [
      "database exited during startup",
      "database readiness timed out",
      "database migration failed",
    ])
  ) {
    return "stack_database"
  }
  if (message.includes("fixture seed failed")) return "stack_fixture"
  if (
    includesAny(message, [
      "worker exited during startup",
      "worker readiness timed out",
    ])
  ) {
    return "stack_worker"
  }
  if (message.includes("usage snapshot failed")) return "stack_usage_snapshot"
  const scopeProbeFailure = classifyScopeProbeFailure(message)
  if (scopeProbeFailure) return scopeProbeFailure
  if (message.includes("scope probe failed")) return "stack_scope_probe"
  if (
    includesAny(message, [
      "could not reserve a local port",
      "service exited during startup",
      "service readiness timed out",
      "setup command failed",
    ])
  ) {
    return "stack_infrastructure"
  }
  return "unknown"
}
