import type {
  AgentAccountContext,
  AgentIssue,
  AgentIssueDetail,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  GetIssueToolInput,
  ReadIssueAttachmentImageToolInput,
  ReadIssueAttachmentImageToolResult,
} from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { noopObserve } from "@mastra/core/tools"
import { describe, expect, it, vi } from "vitest"

import type { AgentToolExecutor } from "../tool-runtime"
import {
  createGetIssueTool,
  createReadAccountContextTool,
  createReadActiveOrganizationTool,
  createReadIssueAttachmentImageTool,
  createSearchIssueLabelsTool,
  createSearchIssuesTool,
  createSearchOrganizationMembersTool,
} from "./factories"

const requestContext = new RequestContext()
const context = {
  agent: {
    agentId: "agent_1",
    messages: [],
    suspend: async () => undefined,
    toolCallId: "call_1",
  },
  observe: noopObserve,
  requestContext,
}
const issue: AgentIssueDetail = {
  assigneeId: null,
  attachments: { items: [], nextCursor: null },
  createdAt: "2026-07-28T00:00:00.000Z",
  description: "Description",
  dueDate: null,
  id: "issue_1",
  labels: ["bug"],
  number: 1,
  priority: "medium",
  revision: 1,
  status: "open",
  title: "Issue",
  updatedAt: "2026-07-28T00:00:00.000Z",
}
const { attachments: _attachments, ...searchIssue } = issue
const rejectedReadExecution = () =>
  Promise.reject(new Error("private provider failure"))
const readErrorChain = (value: unknown) => {
  const chain: unknown[] = []
  let current = value
  for (let depth = 0; depth < 4; depth += 1) {
    chain.push(current)
    if (!(current instanceof Error)) break
    current = current.cause
  }
  return chain
}

describe("Agent読取tool factory", () => {
  it("アカウントcontextへ空入力とRequestContextを渡す", async () => {
    const account = vi.fn<() => Promise<AgentAccountContext>>(() =>
      Promise.resolve({ name: "User", profileImage: null })
    )

    await expect(
      createReadAccountContextTool(account).execute?.({}, context)
    ).resolves.toEqual({ name: "User", profileImage: null })
    expect(account).toHaveBeenCalledWith(
      {},
      { abortSignal: undefined, requestContext }
    )
  })

  it("active組織contextへ空入力とRequestContextを渡す", async () => {
    const organization = vi.fn<() => Promise<AgentOrganizationContext>>(() =>
      Promise.resolve({
        name: "Organization",
        permissions: {
          canCreateIssues: true,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true,
          canReadIssues: true,
          canUpdateIssues: true,
        },
        role: "member",
        slug: "organization",
      })
    )

    await expect(
      createReadActiveOrganizationTool(organization).execute?.({}, context)
    ).resolves.toMatchObject({ slug: "organization" })
    expect(organization).toHaveBeenCalledWith(
      {},
      { abortSignal: undefined, requestContext }
    )
  })

  it("組織member検索のqueryを整形して既定件数とRequestContextを渡す", async () => {
    const members = vi.fn<() => Promise<AgentMember[]>>(() =>
      Promise.resolve([
        {
          id: "member_1",
          name: "Member",
          profileImage: null,
          role: "member",
        },
      ])
    )

    await expect(
      createSearchOrganizationMembersTool(members).execute?.(
        { query: "  member  " },
        context
      )
    ).resolves.toHaveLength(1)
    expect(members).toHaveBeenCalledWith(
      { limit: 20, query: "member" },
      { abortSignal: undefined, requestContext }
    )
  })

  it("組織member検索の省略入力へ既定値を補う", async () => {
    const members = vi.fn<() => Promise<AgentMember[]>>(() =>
      Promise.resolve([])
    )

    await createSearchOrganizationMembersTool(members).execute?.({}, context)

    expect(members).toHaveBeenCalledWith(
      { limit: 20, query: undefined },
      { abortSignal: undefined, requestContext }
    )
  })

  it("Issue label検索のqueryを整形して指定件数とRequestContextを渡す", async () => {
    const labels = vi.fn<() => Promise<AgentIssueLabel[]>>(() =>
      Promise.resolve([{ label: "bug", usageCount: 1 }])
    )

    await expect(
      createSearchIssueLabelsTool(labels).execute?.(
        { limit: 3, query: "  bug  " },
        context
      )
    ).resolves.toHaveLength(1)
    expect(labels).toHaveBeenCalledWith(
      { limit: 3, query: "bug" },
      { abortSignal: undefined, requestContext }
    )
  })

  it("Issue label検索の省略入力へ既定値を補う", async () => {
    const labels = vi.fn<() => Promise<AgentIssueLabel[]>>(() =>
      Promise.resolve([])
    )

    await createSearchIssueLabelsTool(labels).execute?.({}, context)

    expect(labels).toHaveBeenCalledWith(
      { limit: 20, query: undefined },
      { abortSignal: undefined, requestContext }
    )
  })

  it("Issue検索のqueryを整形して既定件数とRequestContextを渡す", async () => {
    const issues = vi.fn<() => Promise<AgentIssue[]>>(() =>
      Promise.resolve([searchIssue])
    )

    await expect(
      createSearchIssuesTool(issues).execute?.(
        { label: "  bug  ", search: "  issue  " },
        context
      )
    ).resolves.toEqual([searchIssue])
    expect(issues).toHaveBeenCalledWith(
      { label: "bug", limit: 20, search: "issue" },
      { abortSignal: undefined, requestContext }
    )
  })

  it("Issue検索の省略入力へ既定値を補う", async () => {
    const issues = vi.fn<() => Promise<AgentIssue[]>>(() => Promise.resolve([]))

    await createSearchIssuesTool(issues).execute?.({}, context)

    expect(issues).toHaveBeenCalledWith(
      { label: undefined, limit: 20, search: undefined },
      { abortSignal: undefined, requestContext }
    )
  })

  it("画像結果をsidecarへ渡してprovider tool-callの同一性を保持する", async () => {
    const abortController = new AbortController()
    const result: ReadIssueAttachmentImageToolResult = {
      contentType: "image/webp",
      fileId: "file_1",
      issueId: "issue_1",
      sizeBytes: 4,
    }
    const bytesByResult = new WeakMap<object, Uint8Array>([
      [result, Uint8Array.of(1, 2, 3, 4)],
    ])
    const executor = vi.fn<
      AgentToolExecutor<
        ReadIssueAttachmentImageToolInput,
        ReadIssueAttachmentImageToolResult
      >
    >(() => Promise.resolve(result))
    const toModelOutput = vi.fn<(output: unknown) => object>((output) => ({
      type: "content",
      value: [
        {
          data:
            typeof output === "object" && output !== null
              ? bytesByResult.get(output)
              : undefined,
          mediaType: "image/webp",
          type: "media",
        },
      ],
    }))
    const tool = createReadIssueAttachmentImageTool(executor, toModelOutput)
    const imageContext = { ...context, abortSignal: abortController.signal }
    const output = await tool.execute?.(
      { fileId: "file_1", issueId: "issue_1" },
      imageContext
    )

    expect(output).toBe(result)
    expect(executor).toHaveBeenCalledWith(
      { fileId: "file_1", issueId: "issue_1" },
      {
        abortSignal: abortController.signal,
        requestContext,
        toolCallId: "call_1",
      }
    )
    expect(tool.toModelOutput?.(output)).toEqual({
      type: "content",
      value: [
        {
          data: Uint8Array.of(1, 2, 3, 4),
          mediaType: "image/webp",
          type: "media",
        },
      ],
    })
    expect(toModelOutput).toHaveBeenCalledWith(result)
  })

  it("画像読取入力のprivate organizationIdをexecutor実行前に拒否する", async () => {
    const result: ReadIssueAttachmentImageToolResult = {
      contentType: "image/webp",
      fileId: "file_1",
      issueId: "issue_1",
      sizeBytes: 4,
    }
    const invalidExecutor = vi.fn<
      AgentToolExecutor<
        ReadIssueAttachmentImageToolInput,
        ReadIssueAttachmentImageToolResult
      >
    >(() => Promise.resolve(result))
    const toModelOutput = vi.fn<(output: unknown) => object>(() => ({
      type: "content",
      value: [],
    }))
    const invalidImageInput: ReadIssueAttachmentImageToolInput = JSON.parse(
      '{"fileId":"file_1","issueId":"issue_1","organizationId":"private_org"}'
    )
    await expect(
      createReadIssueAttachmentImageTool(
        invalidExecutor,
        toModelOutput
      ).execute?.(invalidImageInput, context)
    ).resolves.toMatchObject({ error: true })
    expect(invalidExecutor).not.toHaveBeenCalled()
  })

  it("get_issueのprovider互換性を保ちながらlookupを一つに制限する", async () => {
    const executor = vi.fn<
      (
        input: GetIssueToolInput,
        context: {
          abortSignal?: AbortSignal
          requestContext: RequestContext
        }
      ) => Promise<AgentIssueDetail>
    >(() => Promise.resolve(issue))
    const tool = createGetIssueTool(executor)
    const controller = new AbortController()
    const executionContext = {
      abortSignal: controller.signal,
      observe: noopObserve,
      requestContext,
    }

    await expect(
      tool.execute?.({ lookup: "id", id: "issue_1" }, executionContext)
    ).resolves.toEqual(issue)
    expect(executor).toHaveBeenCalledOnce()
    expect(executor).toHaveBeenCalledWith(
      { lookup: "id", id: "issue_1" },
      { abortSignal: controller.signal, requestContext }
    )
    await expect(
      tool.execute?.(
        { lookup: "id", id: "issue_1", number: 1 },
        executionContext
      )
    ).rejects.toThrow("Agent tool execution failed")
    expect(executor).toHaveBeenCalledOnce()
  })

  it("capability fieldを除外して不正なget_issue入力を拒否する", async () => {
    const executor = vi.fn<() => Promise<AgentIssueDetail>>(() =>
      Promise.resolve(issue)
    )
    const tool = createGetIssueTool(executor)
    await expect(
      Promise.resolve(
        tool.inputSchema?.["~standard"].validate({
          grant: "private",
          id: "issue_1",
          lookup: "id",
        })
      )
    ).resolves.toMatchObject({ issues: expect.any(Array) })
    await expect(
      tool.execute?.(
        { lookup: "number", number: 0 },
        { observe: noopObserve, requestContext }
      )
    ).resolves.toMatchObject({ error: true })
    expect(executor).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: "アカウントcontext読取",
      invoke: () =>
        createReadAccountContextTool(rejectedReadExecution).execute?.(
          {},
          context
        ),
    },
    {
      name: "active組織読取",
      invoke: () =>
        createReadActiveOrganizationTool(rejectedReadExecution).execute?.(
          {},
          context
        ),
    },
    {
      name: "組織member検索",
      invoke: () =>
        createSearchOrganizationMembersTool(rejectedReadExecution).execute?.(
          {},
          context
        ),
    },
    {
      name: "Issue label検索",
      invoke: () =>
        createSearchIssueLabelsTool(rejectedReadExecution).execute?.(
          {},
          context
        ),
    },
    {
      name: "Issue一覧検索",
      invoke: () =>
        createSearchIssuesTool(rejectedReadExecution).execute?.({}, context),
    },
  ])("$nameがprovider失敗を固定errorへ変換する", async ({ invoke }) => {
    await expect(invoke()).rejects.toThrow("Agent tool execution failed")
  })

  it("代表読取toolの不正出力を安全に投影する", async () => {
    const invalidOutputSecret = "private-read-output-sentinel"
    let invalidOutputError: unknown
    try {
      await createGetIssueTool(() =>
        Promise.resolve<AgentIssueDetail>(
          JSON.parse(JSON.stringify({ privateUrl: invalidOutputSecret }))
        )
      ).execute?.({ id: "issue_1", lookup: "id" }, context)
    } catch (error) {
      invalidOutputError = error
    }
    expect(invalidOutputError).toBeInstanceOf(Error)
    for (const error of readErrorChain(invalidOutputError)) {
      expect(String(error)).not.toContain(invalidOutputSecret)
      expect(JSON.stringify(error) ?? "").not.toContain(invalidOutputSecret)
    }
  })

  it("代表読取toolのprivate provider失敗を安全に投影する", async () => {
    const secret = "private-grant-value"
    const cause = new Error(`provider failure ${secret}`)
    let caught: unknown
    try {
      await createGetIssueTool(() => Promise.reject(cause)).execute?.(
        { id: "issue_1", lookup: "id" },
        context
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    if (!(caught instanceof Error)) throw new Error("Expected tool error")
    expect(caught.message).toBe("Agent tool execution failed")
    expect(caught.cause).toBe(cause)
    expect(String(caught)).not.toContain(secret)
  })
})
