import type {
  AgentIssue,
  AgentIssueDetail,
} from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { noopObserve } from "@mastra/core/tools"
import { describe, expect, it, vi } from "vitest"

import { createAgentToolBudget } from "../../../core/budget/tool"
import { createAgentVisionBudget } from "../../../core/budget/vision"
import type { AgentControlPlanePort as AgentInternalGateway } from "../../../runtime/ports"
import {
  createAgentIssueImageHandler,
  createAgentReadHandlers,
  issueAttachmentImageToModelOutput,
} from "./execute"
import { createIssueReadTools } from "./tool"

const RUN_GRANT = "run_0123456789abcdefghijklmnopqrstuvwxyz"

type AgentReadApi = Pick<
  AgentInternalGateway,
  | "getIssue"
  | "readAccountContext"
  | "readActiveOrganization"
  | "searchIssueLabels"
  | "searchIssues"
  | "searchOrganizationMembers"
>

const issue = (description = "description"): AgentIssue => ({
  assigneeId: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  description,
  dueDate: null,
  id: "issue_1",
  labels: ["bug"],
  number: 1,
  priority: "medium",
  revision: 1,
  status: "open",
  title: "Issue",
  updatedAt: "2026-07-22T00:00:00.000Z",
})

const issueDetail = (description = "description"): AgentIssueDetail => ({
  ...issue(description),
  attachments: { items: [], nextCursor: null },
})

const apiHarness = (options: { issueDescription?: string } = {}) => {
  const grants: string[] = []
  const api: AgentReadApi = {
    getIssue: (input) => {
      grants.push(input.grant)
      return Promise.resolve(issueDetail(options.issueDescription))
    },
    readAccountContext: (input) => {
      grants.push(input.grant)
      return Promise.resolve({
        name: "User",
        profileImage: "https://private.example.test/account.png?token=secret",
      })
    },
    readActiveOrganization: (input) => {
      grants.push(input.grant)
      return Promise.resolve({
        name: "Example",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "member",
        slug: "example",
      })
    },
    searchIssueLabels: (input) => {
      grants.push(input.grant)
      return Promise.resolve([{ label: "bug", usageCount: 1 }])
    },
    searchIssues: (input) => {
      grants.push(input.grant)
      return Promise.resolve([issue("x".repeat(3_000))])
    },
    searchOrganizationMembers: (input) => {
      grants.push(input.grant)
      return Promise.resolve([
        {
          id: "member_1",
          name: "Member",
          profileImage: "https://private.example.test/member.png?token=secret",
          role: "member",
        },
      ])
    },
  }
  return { api, grants }
}

describe("createAgentReadHandlersの契約", () => {
  it("有界なread tool六個だけを公開する", () => {
    const issueReadTools = createIssueReadTools(() => {
      throw new Error("unused")
    })
    expect(Object.keys(issueReadTools).toSorted()).toEqual([
      "get_issue",
      "read_account_context",
      "read_active_organization",
      "search_issue_labels",
      "search_issues",
      "search_organization_members",
    ])
  })

  it("全API capabilityへrun grantだけを注入する", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    const results = await Promise.all([
      handlers.readAccountContext(),
      handlers.readActiveOrganization(),
      handlers.searchOrganizationMembers({ limit: 10 }),
      handlers.searchIssueLabels({ limit: 10 }),
      handlers.searchIssues({ limit: 10 }),
      handlers.getIssue({ lookup: "number", number: 1 }),
    ])

    expect(test.grants).toEqual(Array.from({ length: 6 }, () => RUN_GRANT))
    expect(JSON.stringify(results)).not.toContain(RUN_GRANT)
    expect(results[0]).toEqual({ name: "User", profileImage: null })
    expect(results[2]).toEqual([
      { id: "member_1", name: "Member", profileImage: null, role: "member" },
    ])
    expect(JSON.stringify(results)).not.toContain("private.example.test")
  })

  it("本番get_issue registryをruntime capability注入へ接続する", async () => {
    const description = "x".repeat(50_000)
    const test = apiHarness({ issueDescription: description })
    const issueReadTools = createIssueReadTools(() => ({
      api: Object.assign(JSON.parse("{}"), test.api),
      budget: createAgentToolBudget(),
      onRevoked: () => undefined,
      rootRunId: "root_test",
      runGrant: RUN_GRANT,
      settlement: JSON.parse("{}"),
      suspendAction: async () => undefined,
      visionBudget: createAgentVisionBudget(),
    }))
    const execute = issueReadTools.get_issue.execute

    const result = await Reflect.apply(
      execute ?? (() => undefined),
      undefined,
      [
        { lookup: "id", id: "issue_1" },
        { observe: noopObserve, requestContext: new RequestContext() },
      ]
    )

    expect(test.grants).toEqual([RUN_GRANT])
    expect(result.description).toHaveLength(20_000)
    expect(result.description.endsWith("…")).toBe(true)
  })

  it("本番get_issueにruntime contextがない場合は安全側に失敗する", async () => {
    const issueReadTools = createIssueReadTools(() => {
      throw new Error("Agent runtime capability is unavailable")
    })
    const execute = issueReadTools.get_issue.execute
    let caught: unknown
    try {
      await Reflect.apply(execute ?? (() => undefined), undefined, [
        { lookup: "id", id: "issue_1" },
        { observe: noopObserve, requestContext: new RequestContext() },
      ])
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain("Agent tool execution failed")
  })

  it("一覧検索で返すIssue descriptionを制限する", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    const results = await handlers.searchIssues({ limit: 10 })

    expect(results[0]?.description).toHaveLength(2_000)
    expect(results[0]?.description.endsWith("…")).toBe(true)
  })

  it("runごとのread tool budget到達後に停止する", async () => {
    const test = apiHarness()
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)
    await Promise.all(
      Array.from({ length: 20 }, () => handlers.readAccountContext())
    )

    await expect(handlers.readAccountContext()).rejects.toThrow(
      "Agent tool limit reached"
    )
    expect(test.grants).toHaveLength(20)
  })

  it("private HTTP errorを固定tool errorへ置換する", async () => {
    const cause = new Error(`private error ${RUN_GRANT}`)
    const test = apiHarness()
    test.api.readAccountContext = () => Promise.reject(cause)
    const handlers = createAgentReadHandlers(test.api, RUN_GRANT)

    const failure = await handlers.readAccountContext().then(
      () => undefined,
      (error: unknown) => error
    )
    expect(failure).toBeInstanceOf(Error)
    if (!(failure instanceof Error)) throw new Error("Expected read error")
    expect(failure.message).toBe("Agent read capability is unavailable")
    expect(failure.cause).toBe(cause)
    expect(String(failure)).not.toContain(RUN_GRANT)
  })
})

describe("Issue添付画像sidecar", () => {
  it("sidecar読取前に不正な画像metadataを拒否する", () => {
    expect(() => issueAttachmentImageToModelOutput({})).toThrow(
      "Issue attachment image is unavailable"
    )
  })

  it("正規出力をmetadataだけに保ってWeakMap sidecarを一度消費する", async () => {
    const getIssueAttachmentImageForModel = vi.fn<
      AgentInternalGateway["getIssueAttachmentImageForModel"]
    >(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "content-length": "3",
            "content-type": "image/webp",
          },
        })
    )
    const visionBudget = createAgentVisionBudget()
    const handler = createAgentIssueImageHandler(
      { getIssueAttachmentImageForModel },
      RUN_GRANT,
      createAgentToolBudget(),
      visionBudget
    )

    const output = await handler({
      issueId: "issue_1",
      fileId: "file_1",
    })

    expect(output).toEqual({
      issueId: "issue_1",
      fileId: "file_1",
      contentType: "image/webp",
      sizeBytes: 3,
    })
    expect(JSON.stringify(output)).not.toMatch(
      /base64|data:|https?:|objectKey|AQID/
    )
    expect(visionBudget.includedCount()).toBe(1)

    const modelOutput = issueAttachmentImageToModelOutput(output)
    expect(modelOutput.value).toContainEqual({
      type: "media",
      data: "AQID",
      mediaType: "image/webp",
    })
    expect(() => issueAttachmentImageToModelOutput(output)).toThrow(
      "Issue attachment image is unavailable"
    )
  })

  it("四画像のrun上限を現在message画像と共有する", async () => {
    const getIssueAttachmentImageForModel = vi.fn<
      AgentInternalGateway["getIssueAttachmentImageForModel"]
    >(
      async () =>
        new Response(new Uint8Array([1]), {
          headers: {
            "content-length": "1",
            "content-type": "image/webp",
          },
        })
    )
    const visionBudget = createAgentVisionBudget(3)
    const handler = createAgentIssueImageHandler(
      { getIssueAttachmentImageForModel },
      RUN_GRANT,
      createAgentToolBudget(),
      visionBudget
    )
    const first = await handler({ issueId: "issue_1", fileId: "file_1" })
    issueAttachmentImageToModelOutput(first)

    await expect(
      handler({ issueId: "issue_1", fileId: "file_2" })
    ).rejects.toThrow("Agent image input limit reached")
    expect(getIssueAttachmentImageForModel).toHaveBeenCalledTimes(1)
    expect(visionBudget.includedCount()).toBe(4)
  })
})
