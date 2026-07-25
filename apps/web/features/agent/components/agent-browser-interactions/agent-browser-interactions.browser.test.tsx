import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AgentIssueAction } from "../../schema"
import {
  agentContextBudgetMessages,
  agentConversationTurns,
} from "../../test-support/fixtures"
import { AgentApprovalCard } from "../agent-approval-card/agent-approval-card"
import { AgentConversationViewport } from "../agent-conversation-viewport/agent-conversation-viewport"
import { AgentMeters } from "../agent-meters/agent-meters"
import {
  AgentNewThreadComposer,
  type AgentNewThreadInput,
} from "../agent-new-thread-composer/agent-new-thread-composer"
import { AgentSamplePrompts } from "../agent-sample-prompts/agent-sample-prompts"

const contextBudgetNearLimit = [...agentContextBudgetMessages.nearLimit]
const conversationTurns = [...agentConversationTurns]
const organizationId = "organization-1"
const timestamp = "2026-07-25T09:00:00.000Z"

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

describe("Agent browser interactions", () => {
  it("hands off a real inline mention with the default Ask always policy", async () => {
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

  it("submits Yes and resumes the approved action", async () => {
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

    await screen.findByText(`Approval ${actionId}`)
    await actor.click(screen.getByRole("button", { name: "Yes" }))

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

  it("submits No without resuming the rejected action", async () => {
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

    await screen.findByText(`Approval ${actionId}`)
    await actor.click(screen.getByRole("button", { name: "No" }))

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

  it("selects a sample prompt with real browser focus semantics", async () => {
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

  it("opens the context budget tooltip without horizontal overflow", async () => {
    const actor = userEvent.setup()
    render(
      <TooltipProvider>
        <AgentMeters streamedMessages={contextBudgetNearLimit} />
      </TooltipProvider>
    )

    const trigger = screen.getByRole("button", {
      name: "Last request context 95% used",
    })
    await actor.hover(trigger)
    await expect
      .element(await screen.findByText("Last request actual"))
      .toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })

  it("jumps between real scroll regions from the conversation minimap", async () => {
    const actor = userEvent.setup()
    render(
      <div className="flex h-80 min-w-0">
        <AgentConversationViewport enabled turns={conversationTurns}>
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
    const before = viewport.scrollTop
    await actor.click(
      screen.getByRole("button", {
        name: /Jump to turn 1: Review the organization access policy/u,
      })
    )
    expect(viewport.scrollTop).toBeLessThanOrEqual(before)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })
})
