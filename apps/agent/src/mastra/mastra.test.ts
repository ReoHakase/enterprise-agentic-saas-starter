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

describe("Mastra product agent registryの契約", () => {
  it("承認済みIssue action workflowをruntimeとStudioへ登録する", () => {
    expect(mastra.getWorkflow("approvedIssueActionWorkflow")).toBe(
      approvedIssueActionWorkflow
    )
    expect(approvedIssueActionWorkflow.id).toBe("approved-issue-action")
  })

  it("正規product agentを登録する", () => {
    expect(mastra.getAgentById("product-agent")).toBe(productAgent)
    expect(productAgent.id).toBe("product-agent")
  })

  it("product runtimeへLuna modelを割り当てる", async () => {
    const runtime = productAgentRequestContext(false)
    try {
      const model = await productAgent.getModel({
        requestContext: runtime.requestContext,
      })
      expect(model.modelId).toBe("openai/gpt-5.6-luna")
      expect(model.provider).toBe("openrouter")
    } finally {
      runtime.release()
    }
  })

  it("product agentがMemoryを所有する", () => {
    expect(productAgent.hasOwnMemory()).toBe(true)
  })

  it("runtime contextなしのmodel解決を拒否する", async () => {
    await expect(productAgent.getModel()).rejects.toThrow(
      "Agent runtime capability is unavailable"
    )
  })

  it("inline skill名を固定する", async () => {
    expect(
      (await productAgent.listSkills()).map((skill) => skill.name)
    ).toEqual(["core", "issue-triage", "issue-writing", "web-assistance"])
  })

  it("provider Web検索をguard済みproduct toolの背後に保つ", async () => {
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
    const standardRuntime = productAgentRequestContext(false)
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
    } finally {
      standardRuntime.release()
    }
  })

  it("vision許可時だけ画像読取toolを登録する", async () => {
    const visionRuntime = productAgentRequestContext(true)
    const standardRuntime = productAgentRequestContext(false)
    try {
      const visionTools = await productAgent.listTools({
        requestContext: visionRuntime.requestContext,
      })
      const standardTools = await productAgent.listTools({
        requestContext: standardRuntime.requestContext,
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
    } finally {
      visionRuntime.release()
      standardRuntime.release()
    }
  })

  it("tool allowlistでproduct toolを絞り込む", async () => {
    const allowlistRuntime = productAgentRequestContext(false, [
      "search_issues",
    ])
    try {
      expect(
        Object.keys(
          await productAgent.listTools({
            requestContext: allowlistRuntime.requestContext,
          })
        )
      ).toEqual(["search_issues"])
    } finally {
      allowlistRuntime.release()
    }
  })

  it.each([
    {
      currentMessageHasAssets: false,
      expected: false,
      label: "利用可能なassetなし",
      reusableThreadAssetsAvailable: false,
    },
    {
      currentMessageHasAssets: true,
      expected: true,
      label: "current message assetあり",
      reusableThreadAssetsAvailable: false,
    },
    {
      currentMessageHasAssets: false,
      expected: true,
      label: "再利用可能なthread assetあり",
      reusableThreadAssetsAvailable: true,
    },
  ])(
    "$labelの場合にattachment write toolの登録を切り替える",
    async ({
      currentMessageHasAssets,
      expected,
      reusableThreadAssetsAvailable,
    }) => {
      const runtime = productAgentRequestContext(
        false,
        undefined,
        true,
        currentMessageHasAssets,
        reusableThreadAssetsAvailable
      )
      try {
        const tools = await productAgent.listTools({
          requestContext: runtime.requestContext,
        })
        expect(Object.keys(tools).includes("add_issue_attachments")).toBe(
          expected
        )
      } finally {
        runtime.release()
      }
    }
  )

  it("公開Web検索用の入れ子Agentを登録しない", () => {
    expect(() => mastra.getAgentById("public-web-research-agent")).toThrow(
      "Agent with id public-web-research-agent not found"
    )
  })
})
