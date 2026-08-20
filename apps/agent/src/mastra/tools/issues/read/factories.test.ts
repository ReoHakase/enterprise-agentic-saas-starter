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
const rejectedExecution = () =>
  Promise.reject(new Error("private provider failure"))
const invalidOutput = <Output>() =>
  Promise.resolve<Output>(JSON.parse('{"privateUrl":"private"}'))

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

describe("Agent read tool factories", () => {
  it("passes bounded inputs, defaults, and RequestContext identity", async () => {
    const account = vi.fn<() => Promise<AgentAccountContext>>(() =>
      Promise.resolve({ name: "User", profileImage: null })
    )
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
    const labels = vi.fn<() => Promise<AgentIssueLabel[]>>(() =>
      Promise.resolve([{ label: "bug", usageCount: 1 }])
    )
    const issues = vi.fn<() => Promise<AgentIssue[]>>(() =>
      Promise.resolve([searchIssue])
    )

    await expect(
      createReadAccountContextTool(account).execute?.({}, context)
    ).resolves.toEqual({ name: "User", profileImage: null })
    await expect(
      createReadActiveOrganizationTool(organization).execute?.({}, context)
    ).resolves.toMatchObject({ slug: "organization" })
    await expect(
      createSearchOrganizationMembersTool(members).execute?.(
        { query: "  member  " },
        context
      )
    ).resolves.toHaveLength(1)
    await expect(
      createSearchIssueLabelsTool(labels).execute?.(
        { limit: 3, query: "  bug  " },
        context
      )
    ).resolves.toHaveLength(1)
    await expect(
      createSearchIssuesTool(issues).execute?.(
        { label: "  bug  ", search: "  issue  " },
        context
      )
    ).resolves.toEqual([searchIssue])
    await createSearchOrganizationMembersTool(members).execute?.({}, context)
    await createSearchIssueLabelsTool(labels).execute?.({}, context)
    await createSearchIssuesTool(issues).execute?.({}, context)

    expect(account).toHaveBeenCalledWith(
      {},
      { abortSignal: undefined, requestContext }
    )
    expect(organization).toHaveBeenCalledWith(
      {},
      { abortSignal: undefined, requestContext }
    )
    expect(members).toHaveBeenNthCalledWith(
      1,
      { limit: 20, query: "member" },
      { abortSignal: undefined, requestContext }
    )
    expect(labels).toHaveBeenNthCalledWith(
      1,
      { limit: 3, query: "bug" },
      { abortSignal: undefined, requestContext }
    )
    expect(issues).toHaveBeenNthCalledWith(
      1,
      { label: "bug", limit: 20, search: "issue" },
      { abortSignal: undefined, requestContext }
    )
    expect(members).toHaveBeenLastCalledWith(
      { limit: 20, query: undefined },
      { abortSignal: undefined, requestContext }
    )
    expect(labels).toHaveBeenLastCalledWith(
      { limit: 20, query: undefined },
      { abortSignal: undefined, requestContext }
    )
    expect(issues).toHaveBeenLastCalledWith(
      { label: undefined, limit: 20, search: undefined },
      { abortSignal: undefined, requestContext }
    )
  })

  it("preserves image result identity and provider tool-call identity", async () => {
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

    const invalidExecutor = vi.fn<
      AgentToolExecutor<
        ReadIssueAttachmentImageToolInput,
        ReadIssueAttachmentImageToolResult
      >
    >(() => Promise.resolve(result))
    const invalidImageInput: ReadIssueAttachmentImageToolInput = JSON.parse(
      '{"fileId":"file_1","issueId":"issue_1","organizationId":"private_org"}'
    )
    await expect(
      createReadIssueAttachmentImageTool(
        invalidExecutor,
        toModelOutput
      ).execute?.(invalidImageInput, imageContext)
    ).resolves.toMatchObject({ error: true })
    expect(invalidExecutor).not.toHaveBeenCalled()
  })

  it("keeps get_issue provider-compatible while enforcing one lookup", async () => {
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
    expect(
      tool.inputSchema?.["~standard"].jsonSchema?.input({
        target: "draft-07",
      })
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        id: expect.any(Object),
        lookup: expect.any(Object),
        number: expect.any(Object),
      },
      type: "object",
    })

    await expect(
      tool.execute?.(
        { lookup: "id", id: "issue_1", number: 1 },
        executionContext
      )
    ).rejects.toThrow("Agent tool execution failed")
    expect(executor).toHaveBeenCalledOnce()
  })

  it("keeps capability fields out and rejects invalid get_issue input", async () => {
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

  it("rejects invalid read output and projects private failures safely", async () => {
    const calls = [
      () => createReadAccountContextTool(invalidOutput).execute?.({}, context),
      () =>
        createReadActiveOrganizationTool(invalidOutput).execute?.({}, context),
      () =>
        createSearchOrganizationMembersTool(invalidOutput).execute?.(
          {},
          context
        ),
      () => createSearchIssueLabelsTool(invalidOutput).execute?.({}, context),
      () => createSearchIssuesTool(invalidOutput).execute?.({}, context),
      () =>
        createGetIssueTool(invalidOutput).execute?.(
          { id: "issue_1", lookup: "id" },
          context
        ),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )

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

  it("uses safe errors for every non-image read executor boundary", async () => {
    const calls = [
      () =>
        createReadAccountContextTool(rejectedExecution).execute?.({}, context),
      () =>
        createReadActiveOrganizationTool(rejectedExecution).execute?.(
          {},
          context
        ),
      () =>
        createSearchOrganizationMembersTool(rejectedExecution).execute?.(
          {},
          context
        ),
      () =>
        createSearchIssueLabelsTool(rejectedExecution).execute?.({}, context),
      () => createSearchIssuesTool(rejectedExecution).execute?.({}, context),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })
})
