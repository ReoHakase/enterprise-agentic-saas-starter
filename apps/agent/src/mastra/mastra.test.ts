import { RequestContext } from "@mastra/core/request-context"
import { describe, expect, it } from "vitest"

import {
  approvedIssueActionWorkflow,
  executionRegistry,
  mastra,
  productAgent,
} from "."
import { createAgentToolBudget } from "./core/budget/tool"
import { createAgentVisionBudget } from "./core/budget/vision"
import { createRunSettlement } from "./runtime/settlement"
import {
  createNativeControlPlane,
  TEST_RUN_GRANT,
} from "./test-support/native-runtime"

const productAgentRequestContext = (
  visionEnabled: boolean,
  toolAllowlist?: readonly string[]
) => {
  const requestContext = new RequestContext()
  const api = createNativeControlPlane()
  const execution = executionRegistry.register({
    api,
    budget: createAgentToolBudget(),
    rootRunId: "run_mastra_registry",
    runGrant: TEST_RUN_GRANT,
    settlement: createRunSettlement(api, TEST_RUN_GRANT),
    suspendAction: async () => undefined,
    visionBudget: createAgentVisionBudget(),
  })
  requestContext.set("runtime", {
    executionId: execution.executionId,
    modelRoute: "product",
    policy: {
      timezone: "Asia/Tokyo",
      toolAllowlist,
      visionEnabled,
      writesEnabled: false,
    },
    resourceId: "resource_mastra_registry",
    threadId: "thread_mastra_registry",
  })
  return { release: execution.release, requestContext }
}

describe("Mastra product agent registry", () => {
  it("registers the approved Issue action workflow for runtime and Studio", () => {
    expect(mastra.getWorkflow("approvedIssueActionWorkflow")).toBe(
      approvedIssueActionWorkflow
    )
    expect(approvedIssueActionWorkflow.id).toBe("approved-issue-action")
  })

  it("registers the canonical agent and Qwen model", async () => {
    expect(mastra.getAgentById("product-agent")).toBe(productAgent)
    expect(productAgent.id).toBe("product-agent")
    const runtime = productAgentRequestContext(false)
    try {
      const model = await productAgent.getModel({
        requestContext: runtime.requestContext,
      })
      expect(model.modelId).toBe("qwen/qwen3.6-flash")
      expect(model.provider).toBe("openrouter")
      expect(productAgent.hasOwnMemory()).toBe(true)
    } finally {
      runtime.release()
    }
  })

  it("pins inline skill names", async () => {
    expect(
      (await productAgent.listSkills()).map((skill) => skill.name)
    ).toEqual(["core", "issue-triage", "issue-writing", "web-assistance"])
  })

  it("keeps provider Web search behind the guarded product tool", async () => {
    const productTools = await productAgent.listTools()
    expect(Object.keys(productTools)).toEqual([
      "get_issue",
      "read_account_context",
      "read_active_organization",
      "search_issue_labels",
      "search_issues",
      "search_organization_members",
      "web_search",
    ])
    expect(productTools.web_search).not.toMatchObject({ type: "provider" })
    const visionRuntime = productAgentRequestContext(true)
    const standardRuntime = productAgentRequestContext(false)
    const allowlistRuntime = productAgentRequestContext(false, [
      "search_issues",
    ])
    try {
      const visionTools = await productAgent.listTools({
        requestContext: visionRuntime.requestContext,
      })
      expect(Object.keys(visionTools)).toContain("read_issue_attachment_image")
      expect(
        Reflect.get(
          visionTools.read_issue_attachment_image ?? {},
          "outputSchema"
        )
      ).toBeUndefined()
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: standardRuntime.requestContext,
          })
        )
      ).not.toContain("read_issue_attachment_image")
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: allowlistRuntime.requestContext,
          })
        )
      ).toEqual(["search_issues"])

      expect(() => mastra.getAgentById("public-web-research-agent")).toThrow(
        "Agent with id public-web-research-agent not found"
      )
    } finally {
      visionRuntime.release()
      standardRuntime.release()
      allowlistRuntime.release()
    }
  })
})
