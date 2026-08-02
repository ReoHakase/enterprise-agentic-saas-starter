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
  toolAllowlist?: readonly string[],
  writesEnabled = false,
  currentMessageHasAssets = false,
  reusableThreadAssetsAvailable = false
) => {
  const requestContext = new RequestContext()
  const api = createNativeControlPlane()
  const execution = executionRegistry.register({
    api,
    budget: createAgentToolBudget(),
    onRevoked: () => undefined,
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
      currentMessageHasAssets,
      reusableThreadAssetsAvailable,
      timezone: "Asia/Tokyo",
      toolAllowlist,
      visionEnabled,
      writesEnabled,
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

  it("registers the canonical agent and Luna model", async () => {
    expect(mastra.getAgentById("product-agent")).toBe(productAgent)
    expect(productAgent.id).toBe("product-agent")
    const runtime = productAgentRequestContext(false)
    try {
      const model = await productAgent.getModel({
        requestContext: runtime.requestContext,
      })
      expect(model.modelId).toBe("openai/gpt-5.6-luna")
      expect(model.provider).toBe("openrouter")
      expect(productAgent.hasOwnMemory()).toBe(true)
      await expect(productAgent.getModel()).rejects.toThrow(
        "Agent runtime capability is unavailable"
      )
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
    const visionRuntime = productAgentRequestContext(true)
    const standardRuntime = productAgentRequestContext(false)
    const allowlistRuntime = productAgentRequestContext(false, [
      "search_issues",
    ])
    const noAssetWriteRuntime = productAgentRequestContext(
      false,
      undefined,
      true
    )
    const assetWriteRuntime = productAgentRequestContext(
      false,
      undefined,
      true,
      true
    )
    const reusableAssetWriteRuntime = productAgentRequestContext(
      false,
      undefined,
      true,
      false,
      true
    )
    try {
      const standardTools = await productAgent.listTools({
        requestContext: standardRuntime.requestContext,
      })
      expect(Object.keys(standardTools)).toEqual([
        "get_issue",
        "read_account_context",
        "read_active_organization",
        "search_issue_labels",
        "search_issues",
        "search_organization_members",
        "web_search",
      ])
      expect(standardTools.web_search).not.toMatchObject({ type: "provider" })
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
      expect(Object.keys(standardTools)).not.toContain(
        "read_issue_attachment_image"
      )
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: allowlistRuntime.requestContext,
          })
        )
      ).toEqual(["search_issues"])
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: noAssetWriteRuntime.requestContext,
          })
        )
      ).not.toContain("add_issue_attachments")
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: assetWriteRuntime.requestContext,
          })
        )
      ).toContain("add_issue_attachments")
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: reusableAssetWriteRuntime.requestContext,
          })
        )
      ).toContain("add_issue_attachments")

      expect(() => mastra.getAgentById("public-web-research-agent")).toThrow(
        "Agent with id public-web-research-agent not found"
      )
    } finally {
      visionRuntime.release()
      standardRuntime.release()
      allowlistRuntime.release()
      noAssetWriteRuntime.release()
      assetWriteRuntime.release()
      reusableAssetWriteRuntime.release()
    }
  })
})
