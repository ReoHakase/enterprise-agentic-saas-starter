import { RequestContext } from "@mastra/core/request-context"
import { describe, expect, it } from "vitest"

import {
  approvedIssueActionWorkflow,
  mastra,
  productAgent,
  publicWebResearchAgent,
} from "."
import { publicWebResearchProviderOptions } from "./agents/public-web-research-agent"

const productAgentRequestContext = (
  visionEnabled: boolean,
  toolAllowlist?: readonly string[]
) => {
  const requestContext = new RequestContext()
  requestContext.set("runtime", {
    executionId: "execution_unavailable",
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
  return requestContext
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
    const model = await productAgent.getModel()
    expect(model.modelId).toBe("qwen/qwen3.6-flash")
    expect(model.provider).toBe("openrouter")
    expect(productAgent.hasOwnMemory()).toBe(true)
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
    const visionTools = await productAgent.listTools({
      requestContext: productAgentRequestContext(true),
    })
    expect(Object.keys(visionTools)).toContain("read_issue_attachment_image")
    expect(
      Reflect.get(visionTools.read_issue_attachment_image ?? {}, "outputSchema")
    ).toBeUndefined()
    expect(
      Object.keys(
        await productAgent.listTools({
          requestContext: productAgentRequestContext(false),
        })
      )
    ).not.toContain("read_issue_attachment_image")
    expect(
      Object.keys(
        await productAgent.listTools({
          requestContext: productAgentRequestContext(false, ["search_issues"]),
        })
      )
    ).toEqual(["search_issues"])

    expect(mastra.getAgentById("public-web-research-agent")).toBe(
      publicWebResearchAgent
    )
    const researchTools = await publicWebResearchAgent.listTools()
    expect(Object.keys(researchTools)).toEqual(["openrouter_web_search"])
    expect(researchTools.openrouter_web_search).toMatchObject({
      args: {
        engine: "exa",
        maxResults: 3,
      },
      type: "provider",
    })
    expect(publicWebResearchProviderOptions.openrouter.reasoning).toEqual({
      enabled: false,
      effort: "none",
      exclude: true,
    })
  })
})
