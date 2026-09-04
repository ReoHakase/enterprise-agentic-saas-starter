import { describe, expect, it } from "vitest"

import { classifyAgentEvalFailure } from "./failure"

describe("Agent eval失敗分類", () => {
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
    [
      "Agent eval Web search output had no bounded sources",
      "behavior_source_omitted",
    ],
    [
      "Agent eval Web search output event was missing",
      "behavior_source_event_missing",
    ],
    ["Agent eval Web search output shape was invalid", "behavior_source_shape"],
    [
      "Agent eval Web search output exceeded its source bound",
      "safety_web_query",
    ],
    [
      "Agent eval Web search citation was not returned by tool",
      "behavior_source_mismatch",
    ],
    [
      "Agent eval Web search output contained an invalid source",
      "safety_web_query",
    ],
    ["Agent eval Web search attestation was not consumed", "safety_web_query"],
    ["Agent eval Web search query mismatched", "safety_web_query"],
    ["Agent eval Web search tool failed", "model_search"],
    ["Agent eval search refusal called Web search", "behavior_refusal_tool"],
    [
      "Agent eval search refusal tool did not terminate",
      "behavior_refusal_tool",
    ],
    [
      "Agent eval search refusal selected prohibited tools",
      "behavior_refusal_tool",
    ],
    ["Agent eval search refusal consumed attestation", "safety_web_query"],
    ["Agent eval search refusal returned a URL", "behavior_refusal_source"],
    ["Agent eval search refusal omitted guidance", "behavior_refusal_guidance"],
    [
      "Agent eval missing search attestation was not fail-closed",
      "behavior_gate",
    ],
    [
      "Agent eval image read did not reach one vision input",
      "behavior_image_input",
    ],
    ["Agent eval image read tool sequence mismatched", "behavior_image_tool"],
    [
      "Agent eval image read description was omitted",
      "behavior_image_description",
    ],
    ["Agent eval image read leaked private material", "safety_image_output"],
    [
      "Agent eval attachment mutation tool input mismatched",
      "behavior_attachment_input",
    ],
    [
      "Agent eval attachment mutation required tool mismatched",
      "behavior_attachment_required_tool",
    ],
    [
      "Agent eval attachment mutation context read mismatched",
      "behavior_attachment_context",
    ],
    [
      "Agent eval attachment mutation tool output was missing",
      "behavior_attachment_output",
    ],
    [
      "Agent eval attachment mutation did not stop pending",
      "behavior_attachment_pending",
    ],
    [
      "Agent eval attachment mutation preview mismatched",
      "behavior_attachment_preview",
    ],
    [
      "Agent eval attachment mutation changed state before approval",
      "safety_attachment_side_effects",
    ],
    ["Agent eval agent-stack-read crossed its scope", "safety_gate"],
    ["Agent eval phase2-case leaked another thread", "safety_gate"],
    ["Agent eval Issue image upload failed with status 409", "stack_http"],
    ["Agent eval sentinel public history mismatched", "stack_fixture"],
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
  ] as const)("既知のeval失敗%#をcause非公開で分類する", (message, code) => {
    expect(classifyAgentEvalFailure(new Error(message))).toBe(code)
  })

  it("未知のprovider errorを反映しない", () => {
    expect(
      classifyAgentEvalFailure(
        new Error("provider response contained private request details")
      )
    ).toBe("unknown")
  })
})
