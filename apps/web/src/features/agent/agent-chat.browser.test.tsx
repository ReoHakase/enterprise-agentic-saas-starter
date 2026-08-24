import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AgentApprovalCard } from "./components/agent-approval-card/agent-approval-card"
import { AgentConversationViewport } from "./components/agent-conversation-viewport/agent-conversation-viewport"
import { AgentConversation } from "./components/agent-conversation/agent-conversation"
import {
  AgentNewThreadComposer,
  type AgentNewThreadInput,
} from "./components/agent-new-thread-composer/agent-new-thread-composer"
import { AgentSamplePrompts } from "./components/agent-sample-prompts/agent-sample-prompts"
import type { AgentIssueAction, AgentThread } from "./schema"
import {
  AgentStoryScope,
  agentConversationTurns,
} from "./test-support/fixtures"

const organizationId = "organization-1"
const timestamp = "2026-07-25T09:00:00.000Z"
const browserConversationTurns = [...agentConversationTurns]
const toolFailureThread = {
  id: "thread-tool-failure",
  title: "Tool failure",
  status: "active",
  createdAt: timestamp,
  updatedAt: timestamp,
} satisfies AgentThread
type RecordedRequest = {
  method: string
  path: string
  body: unknown
}

const createAction = (
  actionId: string,
  status: AgentIssueAction["status"]
): AgentIssueAction => ({
  id: actionId,
  kind: "create_issue",
  status,
  approvalMode: "manual",
  requiresApproval: true,
  preview: {
    kind: "create_issue",
    destructive: false,
    attachmentOperation: null,
    title: `Approval ${actionId}`,
    issueNumber: null,
    issueRevision: null,
    fields: [
      {
        field: "title",
        before: null,
        after: `Approval ${actionId}`,
      },
    ],
    attachments: [],
  },
  previewState: "available",
  expiresAt: "2026-07-26T09:00:00.000Z",
  completedAt: status === "pending" || status === "approved" ? null : timestamp,
})

const installApiTransport = (
  initialActions: Record<string, AgentIssueAction["status"]> = {}
) => {
  const actionStates = new Map(Object.entries(initialActions))
  const requests: RecordedRequest[] = []
  const transport = vi.fn<
    (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
  >(async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const requestText =
      request.method === "GET" ? "" : await request.clone().text()
    const body: unknown = requestText ? JSON.parse(requestText) : undefined
    requests.push({ method: request.method, path: url.pathname, body })

    if (request.method === "GET" && url.pathname === "/issues") {
      return Response.json({
        items: [
          {
            id: "issue-7",
            organizationId,
            number: 7,
            title: "Review tenant audit log",
            description: "",
            status: "open",
            priority: "medium",
            assigneeId: null,
            creatorId: "user-1",
            labels: [],
            dueDate: null,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
            attachmentCount: 0,
            commentCount: 0,
            thumbnail: null,
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      })
    }
    if (
      request.method === "GET" &&
      url.pathname === `/organizations/${organizationId}/members`
    ) {
      return Response.json([])
    }
    if (
      request.method === "GET" &&
      url.pathname === "/agent/threads/thread-tool-failure/messages"
    ) {
      return Response.json({
        messages: [
          {
            id: "assistant-tool-failure",
            role: "assistant",
            parts: [
              {
                type: "tool-get_issue",
                toolCallId: "call-failed",
                state: "output-error",
                errorText: "Agent tool execution failed.",
              },
              {
                type: "tool-update_issue",
                toolCallId: "call-denied",
                state: "approval-responded",
                input: {
                  expectedRevision: 1,
                  issueId: "issue-7",
                  title: "Declined title",
                },
                approval: {
                  id: "approval-1",
                  approved: false,
                  reason: "Denied",
                },
              },
            ],
          },
        ],
        total: 1,
        page: 0,
        perPage: 100,
        hasMore: false,
      })
    }
    if (
      request.method === "GET" &&
      url.pathname === "/agent/threads/thread-tool-failure/permission"
    ) {
      return Response.json({
        mode: "ask_always",
        permissions: {
          createIssue: false,
          updateIssue: false,
          deleteIssue: false,
        },
      })
    }
    if (request.method === "POST" && url.pathname === "/agent/chat") {
      return new Response("data: [DONE]\n\n", {
        headers: { "content-type": "text/event-stream" },
      })
    }

    const actionMatch =
      /^\/agent\/actions\/([^/]+)(?:\/(decision|resume))?$/u.exec(url.pathname)
    if (!actionMatch) {
      throw new Error(`Unhandled browser-test request: ${request.method}`)
    }
    const actionId = decodeURIComponent(actionMatch[1] ?? "")
    const operation = actionMatch[2]
    if (request.method === "GET" && !operation) {
      return Response.json(
        createAction(actionId, actionStates.get(actionId) ?? "pending")
      )
    }
    if (request.method === "POST" && operation === "decision") {
      const decision =
        typeof body === "object" && body !== null && "decision" in body
          ? body.decision
          : undefined
      if (decision !== "yes" && decision !== "no") {
        throw new Error("Approval decision is missing")
      }
      const status = decision === "yes" ? "approved" : "rejected"
      actionStates.set(actionId, status)
      return Response.json(createAction(actionId, status))
    }
    if (request.method === "POST" && operation === "resume") {
      actionStates.set(actionId, "succeeded")
      return Response.json({
        actionId,
        kind: "create_issue",
        status: "succeeded",
        issue: {
          id: "issue-created",
          number: 42,
          revision: 1,
          deleted: false,
        },
      })
    }
    throw new Error(`Unhandled browser-test request: ${request.method}`)
  })
  vi.stubGlobal("fetch", transport)
  return { requests }
}

const renderAgentUi = (children: ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NuqsAdapter>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Agentチャットのブラウザー統合", () => {
  it("サーバーツールの局所障害後もコンポーザーを利用可能に保つ", async () => {
    const { requests } = installApiTransport()
    const actor = userEvent.setup()
    const onAutoSubmit = vi.fn<() => void>()
    const onInitialComposerSnapshotConsumed =
      vi.fn<(threadId: string) => void>()
    renderAgentUi(
      <AgentStoryScope>
        <AgentConversation
          organizationId={organizationId}
          organizationSlug="acme"
          thread={toolFailureThread}
          presentation="page"
          disabled={false}
          autoSubmit={false}
          onAutoSubmit={onAutoSubmit}
          onInitialComposerSnapshotConsumed={onInitialComposerSnapshotConsumed}
        />
      </AgentStoryScope>
    )

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "View IssueFailed"
    )
    expect(screen.getByRole("status")).toHaveTextContent("Update IssueDenied")
    const composer = screen.getByRole("textbox", { name: "Agent message" })
    await actor.click(composer)
    const typeCommittedText = async (
      text: string,
      committedText = composer.textContent ?? ""
    ): Promise<void> => {
      const [character, ...remainingCharacters] = Array.from(text)
      if (!character) return
      const nextCommittedText = `${committedText}${character}`
      await actor.keyboard(character)
      await waitFor(() => expect(composer.textContent).toBe(nextCommittedText))
      await typeCommittedText(remainingCharacters.join(""), nextCommittedText)
    }
    await typeCommittedText("Continue after failure")
    await actor.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() =>
      expect(
        requests.filter(
          ({ method, path }) => method === "POST" && path === "/agent/chat"
        )
      ).toHaveLength(1)
    )
    expect(
      requests.find(
        ({ method, path }) => method === "POST" && path === "/agent/chat"
      )?.body
    ).toMatchObject({
      threadId: "thread-tool-failure",
      contentSegments: [{ type: "text", text: "Continue after failure" }],
    })
  })

  it("既定のAsk alwaysポリシーで実際のインラインメンションを引き渡す", async () => {
    const { requests } = installApiTransport()
    const actor = userEvent.setup()
    const onCreate = vi.fn<(input: AgentNewThreadInput) => void>()
    renderAgentUi(
      <AgentNewThreadComposer
        organizationId={organizationId}
        disabled={false}
        creating={false}
        onCreate={onCreate}
      />
    )

    expect(
      screen.getByRole("combobox", { name: "Agent permission" })
    ).toHaveTextContent("Ask always")
    await waitFor(() => {
      expect(requests.map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          "/issues",
          `/organizations/${organizationId}/members`,
        ])
      )
    })

    const composer = await screen.findByRole("textbox", {
      name: "Agent message",
    })
    await actor.click(composer)
    const typeCommittedText = async (
      text: string,
      committedText = composer.textContent ?? ""
    ): Promise<void> => {
      const [character, ...remainingCharacters] = Array.from(text)
      if (!character) return

      const nextCommittedText = `${committedText}${character}`
      await actor.keyboard(character)
      await waitFor(() => expect(composer.textContent).toBe(nextCommittedText))
      await typeCommittedText(remainingCharacters.join(""), nextCommittedText)
    }
    await typeCommittedText("Compare @review")
    await actor.click(
      await screen.findByRole("button", {
        name: /Issue #7: Review tenant audit log/u,
      })
    )
    await typeCommittedText("today")
    await actor.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
    expect(onCreate).toHaveBeenCalledWith({
      composer: "Compare @Issue #7: Review tenant audit log today",
      snapshot: expect.objectContaining({
        parts: [
          { type: "text", text: "Compare " },
          {
            type: "data-context-reference",
            data: {
              kind: "issue",
              id: "issue-7",
              label: "Issue #7: Review tenant audit log",
            },
          },
          { type: "text", text: " today" },
        ],
      }),
      files: [],
      autoSubmit: true,
      permissionMode: "ask_always",
    })
  })

  it("Yesを送信して承認済みの操作を再開する", async () => {
    const actionId = "action-approve"
    const { requests } = installApiTransport({ [actionId]: "pending" })
    const actor = userEvent.setup()
    const onPendingChange = vi.fn<(id: string, pending: boolean) => void>()
    renderAgentUi(
      <AgentApprovalCard
        organizationId={organizationId}
        organizationSlug="acme"
        actionId={actionId}
        frozen={false}
        onPendingChange={onPendingChange}
      />
    )

    const approval = await screen.findByRole("region", {
      name: "Issue change approval",
    })
    await within(approval).findByText(`Approval ${actionId}`)
    await actor.click(within(approval).getByRole("button", { name: "Yes" }))

    await expect
      .element(await screen.findByRole("link", { name: "Open Issue #42" }))
      .toBeVisible()
    await waitFor(() =>
      expect(onPendingChange).toHaveBeenLastCalledWith(actionId, false)
    )
    const postRequests = requests.filter(({ method }) => method === "POST")
    expect(postRequests.map(({ path }) => path)).toEqual([
      `/agent/actions/${actionId}/decision`,
      `/agent/actions/${actionId}/resume`,
    ])
    expect(postRequests[0]?.body).toEqual({
      decision: "yes",
      idempotencyKey: expect.any(String),
    })
  })

  it("Noを送信し、拒否した操作は再開しない", async () => {
    const actionId = "action-reject"
    const { requests } = installApiTransport({ [actionId]: "pending" })
    const actor = userEvent.setup()
    const onPendingChange = vi.fn<(id: string, pending: boolean) => void>()
    renderAgentUi(
      <AgentApprovalCard
        organizationId={organizationId}
        organizationSlug="acme"
        actionId={actionId}
        frozen={false}
        onPendingChange={onPendingChange}
      />
    )

    const approval = await screen.findByRole("region", {
      name: "Issue change approval",
    })
    await within(approval).findByText(`Approval ${actionId}`)
    await actor.click(within(approval).getByRole("button", { name: "No" }))

    await expect.element(await screen.findByText("rejected")).toBeVisible()
    await waitFor(() =>
      expect(onPendingChange).toHaveBeenLastCalledWith(actionId, false)
    )
    const postRequests = requests.filter(({ method }) => method === "POST")
    expect(postRequests.map(({ path }) => path)).toEqual([
      `/agent/actions/${actionId}/decision`,
    ])
    expect(postRequests[0]?.body).toEqual({
      decision: "no",
      idempotencyKey: expect.any(String),
    })
  })

  it("実ブラウザーのフォーカス動作でサンプルプロンプトを選択する", async () => {
    const actor = userEvent.setup()
    const onSelect = vi.fn<(prompt: string) => void>()
    render(<AgentSamplePrompts onSelect={onSelect} />)

    const prompt = screen.getByRole("button", {
      name: "Summarize the current page and suggest the next action.",
    })
    await actor.tab()
    await actor.tab()
    await expect.element(prompt).toHaveFocus()
    await actor.keyboard("{Enter}")

    expect(onSelect).toHaveBeenCalledWith(
      "Summarize the current page and suggest the next action."
    )
  })

  it("会話本文を中央配置して文書の横overflowを防ぐ", () => {
    render(
      <div className="flex h-80 min-w-0">
        <AgentConversationViewport enabled turns={browserConversationTurns}>
          {agentConversationTurns.map((turn) => (
            <article
              key={turn.id}
              data-agent-turn-id={turn.id}
              className="min-h-72 rounded-2xl border p-5"
            >
              <h2>{turn.prompt}</h2>
              <p>{turn.response}</p>
            </article>
          ))}
        </AgentConversationViewport>
      </div>
    )

    const viewport = screen.getByTestId("agent-conversation-viewport")
    const content = screen.getByTestId("agent-conversation-content")
    const viewportRect = viewport.getBoundingClientRect()
    const contentRect = content.getBoundingClientRect()
    expect(contentRect.width).toBeLessThanOrEqual(768)
    expect(contentRect.left + contentRect.width / 2).toBeCloseTo(
      viewportRect.left + viewportRect.width / 2,
      0
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })
})
