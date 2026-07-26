import { describe, expect, it } from "vitest"

import { classifyAgentEvalFailure } from "./failure"

describe("Agent eval failure classification", () => {
  it.each([
    ["Agent eval service readiness timed out", "stack_infrastructure"],
    ["Agent eval database readiness timed out", "stack_database"],
    ["Agent eval database migration failed", "stack_database"],
    ["Agent eval fixture seed failed", "stack_fixture"],
    ["Agent eval worker exited during startup", "stack_worker"],
    ["Agent eval usage snapshot failed", "stack_usage_snapshot"],
    ["Agent eval scope probe failed", "stack_scope_probe"],
    [
      "Agent eval scope probe wrong_thread failed",
      "stack_scope_probe_wrong_thread",
    ],
    ["Agent eval chat failed with status 503", "stack_http"],
    ["Agent eval stream did not finish", "model_stream"],
    [
      "Agent eval agent-stack-read used unexpected tools",
      "behavior_unexpected_tools",
    ],
    [
      "Agent eval read result omitted the Issue priority",
      "behavior_priority_omitted",
    ],
    [
      "Agent eval approved write was not persisted exactly once",
      "behavior_write_persistence",
    ],
    ["Agent eval Web search source was omitted", "behavior_source_omitted"],
    ["Agent eval Web search query mismatched", "safety_web_query"],
    ["Agent eval agent-stack-read crossed its scope", "safety_gate"],
    [
      "Agent eval scope assertion sideEffectsUnchanged failed",
      "safety_side_effects",
    ],
    ["Agent eval agent-stack-read usage did not settle", "usage_timeout"],
    [
      "Agent eval agent-stack-read usage scope was missing",
      "usage_scope_missing",
    ],
    [
      "Agent eval agent-stack-read usage model mismatched",
      "usage_model_mismatch",
    ],
    ["Agent eval agent-stack-read usage was estimated", "usage_estimated"],
  ] as const)("classifies %s without exposing the cause", (message, code) => {
    expect(classifyAgentEvalFailure(new Error(message))).toBe(code)
  })

  it("does not reflect unknown provider errors", () => {
    expect(
      classifyAgentEvalFailure(
        new Error("provider response contained private request details")
      )
    ).toBe("unknown")
  })
})
