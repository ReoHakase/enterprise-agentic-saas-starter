import type {
  AgentAccountContext,
  AgentIssue,
  AgentIssueLabel,
  AgentMember,
  AgentOrganizationContext,
  IssueWriteToolOutput,
} from "@enterprise-agentic-saas/agent-contracts"
import { RequestContext } from "@mastra/core/request-context"
import { noopObserve } from "@mastra/core/tools"
import { describe, expect, it, vi } from "vitest"

import { createReadAccountContextTool } from "./account/read-account-context"
import { createCreateIssueTool } from "./issues/create-issue"
import { createDeleteIssueTool } from "./issues/delete-issue"
import { createSearchIssueLabelsTool } from "./issues/search-issue-labels"
import { createSearchIssuesTool } from "./issues/search-issues"
import { createUpdateIssueTool } from "./issues/update-issue"
import {
  normalizeCreateIssueToolInput,
  normalizeDeleteIssueToolInput,
  normalizeUpdateIssueToolInput,
} from "./issues/write-normalize"
import { createReadActiveOrganizationTool } from "./organization/read-active-organization"
import { createSearchOrganizationMembersTool } from "./organization/search-organization-members"

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
const issue: AgentIssue = {
  assigneeId: null,
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
const rejected: IssueWriteToolOutput = {
  actionId: "action_1",
  requiresApproval: false,
  status: "rejected",
}
const rejectToolExecution = () =>
  Promise.reject(new Error("private provider failure"))
const invalidToolOutput = () =>
  Promise.resolve(JSON.parse('{"privateUrl":"private"}'))

describe("shared read tool factories", () => {
  it("passes bounded inputs, default limits, and execution context", async () => {
    const account = vi.fn<() => Promise<AgentAccountContext>>(() =>
      Promise.resolve({ name: "User", profileImage: null })
    )
    const organization = vi.fn<() => Promise<AgentOrganizationContext>>(() =>
      Promise.resolve({
        name: "Organization",
        permissions: {
          canCreateIssues: true as const,
          canDeleteAnyIssue: false,
          canDeleteOwnIssues: true as const,
          canReadIssues: true as const,
          canUpdateIssues: true as const,
        },
        role: "member" as const,
        slug: "organization",
      })
    )
    const members = vi.fn<() => Promise<AgentMember[]>>(() =>
      Promise.resolve([
        {
          id: "member_1",
          name: "Member",
          profileImage: null,
          role: "member" as const,
        },
      ])
    )
    const labels = vi.fn<() => Promise<AgentIssueLabel[]>>(() =>
      Promise.resolve([{ label: "bug", usageCount: 1 }])
    )
    const issues = vi.fn<() => Promise<AgentIssue[]>>(() =>
      Promise.resolve([issue])
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
    ).resolves.toEqual([issue])
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

  it("uses safe errors for every read executor boundary", async () => {
    const calls = [
      () =>
        createReadAccountContextTool(rejectToolExecution).execute?.(
          {},
          context
        ),
      () =>
        createReadActiveOrganizationTool(rejectToolExecution).execute?.(
          {},
          context
        ),
      () =>
        createSearchOrganizationMembersTool(rejectToolExecution).execute?.(
          {},
          context
        ),
      () =>
        createSearchIssueLabelsTool(rejectToolExecution).execute?.({}, context),
      () => createSearchIssuesTool(rejectToolExecution).execute?.({}, context),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })

  it("rejects invalid outputs at each shared read boundary", async () => {
    const calls = [
      () =>
        createReadAccountContextTool(invalidToolOutput).execute?.({}, context),
      () =>
        createReadActiveOrganizationTool(invalidToolOutput).execute?.(
          {},
          context
        ),
      () =>
        createSearchOrganizationMembersTool(invalidToolOutput).execute?.(
          {},
          context
        ),
      () =>
        createSearchIssueLabelsTool(invalidToolOutput).execute?.({}, context),
      () => createSearchIssuesTool(invalidToolOutput).execute?.({}, context),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })
})

describe("shared write tool factories", () => {
  it("normalizes writes and preserves the provider tool-call identity", async () => {
    const create = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )
    const update = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )
    const remove = vi.fn<() => Promise<IssueWriteToolOutput>>(() =>
      Promise.resolve(rejected)
    )

    await expect(
      createCreateIssueTool(create).execute?.(
        {
          assigneeId: "",
          attachmentAssetIds: ["asset_1", "asset_1"],
          labels: [" bug ", "bug"],
          title: " Issue ",
        },
        context
      )
    ).resolves.toEqual(rejected)
    await expect(
      createUpdateIssueTool(update).execute?.(
        {
          assigneeId: " member_1 ",
          expectedRevision: 1,
          issueId: " issue_1 ",
          labels: [" bug ", "bug"],
          title: " Updated ",
        },
        context
      )
    ).resolves.toEqual(rejected)
    await expect(
      createDeleteIssueTool(remove).execute?.(
        { expectedRevision: 1, issueId: " issue_1 " },
        context
      )
    ).resolves.toEqual(rejected)

    expect(create).toHaveBeenCalledWith(
      {
        assigneeId: null,
        attachmentAssetIds: ["asset_1"],
        labels: ["bug"],
        title: "Issue",
      },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
    expect(update).toHaveBeenCalledWith(
      {
        assigneeId: "member_1",
        expectedRevision: 1,
        issueId: "issue_1",
        labels: ["bug"],
        title: "Updated",
      },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
    expect(remove).toHaveBeenCalledWith(
      { expectedRevision: 1, issueId: "issue_1" },
      {
        abortSignal: undefined,
        requestContext,
        toolCallId: "call_1",
      }
    )
  })

  it("fails closed when a write has no provider tool-call identity", async () => {
    const noAgentContext = { observe: noopObserve, requestContext }
    const calls = [
      () =>
        createCreateIssueTool(() => Promise.resolve(rejected)).execute?.(
          { title: "Issue" },
          noAgentContext
        ),
      () =>
        createUpdateIssueTool(() => Promise.resolve(rejected)).execute?.(
          { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
          noAgentContext
        ),
      () =>
        createDeleteIssueTool(() => Promise.resolve(rejected)).execute?.(
          { expectedRevision: 1, issueId: "issue_1" },
          noAgentContext
        ),
    ]
    await Promise.all(
      calls.map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })

  it("projects write executor and output validation failures safely", async () => {
    await Promise.all(
      [
        () =>
          createCreateIssueTool(rejectToolExecution).execute?.(
            { title: "Issue" },
            context
          ),
        () =>
          createUpdateIssueTool(invalidToolOutput).execute?.(
            { expectedRevision: 1, issueId: "issue_1", title: "Updated" },
            context
          ),
        () =>
          createDeleteIssueTool(rejectToolExecution).execute?.(
            { expectedRevision: 1, issueId: "issue_1" },
            context
          ),
      ].map((call) =>
        expect(call()).rejects.toThrow("Agent tool execution failed")
      )
    )
  })
})

describe("write normalization boundaries", () => {
  it("covers optional values and rejects updates without a changed field", () => {
    expect(
      normalizeCreateIssueToolInput({
        assigneeId: "member_1",
        title: " Issue ",
      })
    ).toEqual({
      assigneeId: "member_1",
      attachmentAssetIds: [],
      title: "Issue",
    })
    expect(normalizeCreateIssueToolInput({ title: "Issue" })).toEqual({
      attachmentAssetIds: [],
      title: "Issue",
    })
    expect(
      normalizeUpdateIssueToolInput({
        assigneeId: null,
        expectedRevision: 1,
        issueId: "issue_1",
      })
    ).toEqual({
      assigneeId: null,
      expectedRevision: 1,
      issueId: "issue_1",
    })
    expect(
      normalizeUpdateIssueToolInput({
        expectedRevision: 1,
        issueId: "issue_1",
        status: "closed",
      })
    ).toEqual({
      expectedRevision: 1,
      issueId: "issue_1",
      status: "closed",
    })
    expect(() =>
      normalizeUpdateIssueToolInput({
        expectedRevision: 1,
        issueId: "issue_1",
      })
    ).toThrow("Agent tool execution failed")
    expect(
      normalizeDeleteIssueToolInput({
        expectedRevision: 1,
        issueId: " issue_1 ",
      })
    ).toEqual({ expectedRevision: 1, issueId: "issue_1" })
  })
})
