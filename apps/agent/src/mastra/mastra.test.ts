import { describe, expect, it } from "vitest"

import {
  approvedIssueActionWorkflow,
  mastra,
  productAgent,
  publicWebResearchAgent,
  threadTitleAgent,
} from "."
import { productAgentToolsForFeatures } from "./agents/product-agent"
import { publicWebResearchProviderOptions } from "./agents/public-web-research-agent"
import { threadTitleProviderOptions } from "./agents/thread-title-agent"
import { OPENROUTER_MODEL_ID } from "./models/openrouter"
import { openRouterWebSearchOptions } from "./tools/openrouter-web-search"
import { PUBLIC_WEB_RESEARCH_TIMEOUT_MS } from "./tools/web-search"

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
    const model = await productAgent.getModel()
    expect(model.modelId).toBe(OPENROUTER_MODEL_ID)
    expect(model.provider).toBe("openrouter")
    expect(productAgent.hasOwnMemory()).toBe(false)
  })

  it("pins inline skill names", async () => {
    expect(
      (await productAgent.listSkills()).map((skill) => skill.name)
    ).toEqual(["core", "issue-triage", "issue-writing", "web-assistance"])
  })

  it("keeps provider Web search on the isolated research agent", async () => {
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
    const visionTools = productAgentToolsForFeatures({
      visionEnabled: true,
      writesEnabled: false,
    })
    expect(Object.keys(visionTools)).toContain("read_issue_attachment_image")
    expect(
      visionTools.read_issue_attachment_image?.outputSchema
    ).toBeUndefined()
    expect(
      Object.keys(
        productAgentToolsForFeatures({
          visionEnabled: false,
          writesEnabled: false,
        })
      )
    ).not.toContain("read_issue_attachment_image")

    expect(mastra.getAgentById("public-web-research-agent")).toBe(
      publicWebResearchAgent
    )
    const researchTools = await publicWebResearchAgent.listTools()
    expect(Object.keys(researchTools)).toEqual(["openrouter_web_search"])
    expect(researchTools.openrouter_web_search).toMatchObject({
      type: "provider",
    })
    expect(publicWebResearchProviderOptions.openrouter.reasoning).toEqual({
      enabled: false,
      effort: "none",
      exclude: true,
    })
    expect(openRouterWebSearchOptions).toEqual({
      engine: "exa",
      maxResults: 3,
    })
    expect(PUBLIC_WEB_RESEARCH_TIMEOUT_MS).toBe(60_000)

    expect(mastra.getAgentById("thread-title-agent")).toBe(threadTitleAgent)
    const titleTools = await threadTitleAgent.listTools()
    expect(Object.keys(titleTools)).toEqual(["rename_thread"])
    expect(threadTitleProviderOptions.openrouter.reasoning).toEqual({
      enabled: false,
      effort: "none",
      exclude: true,
    })
  })
})
