import type {
  AgentIssueDetail,
  GetIssueToolInput,
} from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { noopObserve } from "@mastra/core/tools"
import { describe, expect, it, vi } from "vitest"

import type { AgentToolExecutionContext } from "../executor"
import { createGetIssueTool } from "./get-issue"

const issue: AgentIssueDetail = {
  id: "issue_1",
  number: 1,
  title: "Issue",
  description: "Description",
  status: "open",
  priority: "medium",
  assigneeId: null,
  labels: ["bug"],
  dueDate: null,
  revision: 1,
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
  attachments: { items: [], nextCursor: null },
}

type GetIssueExecutor = (
  input: GetIssueToolInput,
  context: AgentToolExecutionContext
) => Promise<AgentIssueDetail>

describe("createGetIssueTool", () => {
  it("passes validated business input to the executor exactly once", async () => {
    const executor = vi.fn<GetIssueExecutor>(() => Promise.resolve(issue))
    const tool = createGetIssueTool(executor)
    const executionContext = {
      observe: noopObserve,
      requestContext: new RequestContext(),
    }

    await expect(
      tool.execute?.({ lookup: "id", id: "issue_1" }, executionContext)
    ).resolves.toEqual(issue)
    expect(executor).toHaveBeenCalledOnce()
    expect(executor).toHaveBeenCalledWith(
      { lookup: "id", id: "issue_1" },
      {
        abortSignal: undefined,
        requestContext: executionContext.requestContext,
      }
    )
  })

  it("keeps identity and capability fields outside the published input schema", async () => {
    const schema = createGetIssueTool(() => Promise.resolve(issue)).inputSchema

    expect(schema).toBeDefined()
    await expect(
      Promise.resolve(
        schema?.["~standard"].validate({
          lookup: "id",
          id: "issue_1",
          grant: "private",
        })
      )
    ).resolves.toMatchObject({ issues: expect.any(Array) })
  })

  it("does not invoke the executor for invalid tool input", async () => {
    const executor = vi.fn<GetIssueExecutor>(() => Promise.resolve(issue))
    const execute = createGetIssueTool(executor).execute
    expect(execute).toBeDefined()

    const result = await Reflect.apply(
      execute ?? (() => undefined),
      undefined,
      [
        { lookup: "number", number: 0 },
        {
          observe: noopObserve,
          requestContext: new RequestContext(),
        },
      ]
    )

    expect(result).toMatchObject({
      error: true,
      validationErrors: { fields: { number: expect.any(Object) } },
    })
    expect(executor).not.toHaveBeenCalled()
  })

  it("preserves AbortSignal and RequestContext identity", async () => {
    const executor = vi.fn<GetIssueExecutor>(() => Promise.resolve(issue))
    const execute = createGetIssueTool(executor).execute
    const controller = new AbortController()
    const requestContext = new RequestContext()

    await execute?.(
      { lookup: "id", id: "issue_1" },
      {
        abortSignal: controller.signal,
        observe: noopObserve,
        requestContext,
      }
    )

    expect(executor).toHaveBeenCalledWith(
      { lookup: "id", id: "issue_1" },
      { abortSignal: controller.signal, requestContext }
    )
  })

  it("rejects output containing private or invalid fields", async () => {
    const privateOutput = {
      ...issue,
      privateUrl: "https://private.invalid/issue",
    }
    const execute = createGetIssueTool(() =>
      Promise.resolve(privateOutput)
    ).execute

    let caught: unknown
    try {
      await execute?.(
        { lookup: "id", id: "issue_1" },
        { observe: noopObserve, requestContext: new RequestContext() }
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain("Agent tool execution failed")
    expect(String(caught)).not.toContain(privateOutput.privateUrl)
  })

  it("projects executor failures to a fixed safe error", async () => {
    const secret = "private-grant-value"
    const execute = createGetIssueTool(() =>
      Promise.reject(new Error(`provider failure ${secret}`))
    ).execute

    let caught: unknown
    try {
      await execute?.(
        { lookup: "id", id: "issue_1" },
        { observe: noopObserve, requestContext: new RequestContext() }
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(String(caught)).toContain("Agent tool execution failed")
    expect(String(caught)).not.toContain(secret)
  })
})
