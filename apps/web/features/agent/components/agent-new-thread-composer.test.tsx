import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ChangeEvent } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  AgentNewThreadComposer,
  type AgentNewThreadInput,
} from "./agent-new-thread-composer"

vi.mock("@/features/agent/use-agent-mention-candidates", () => ({
  useAgentMentionCandidates: () => [
    {
      kind: "issue",
      id: "issue-1",
      label: "Issue #1: Review tenant audit log",
    },
  ],
}))

vi.mock("@/features/agent/components/agent-composer", async () => {
  const React = await import("react")
  return {
    AgentComposer: React.forwardRef(
      (
        {
          draftText,
          onDraftTextChange,
        }: {
          draftText: string
          onDraftTextChange: (value: string) => void
        },
        ref: React.ForwardedRef<{
          snapshot: () => {
            document: { type: string }
            parts: unknown[]
          }
        }>
      ) => {
        React.useImperativeHandle(ref, () => ({
          snapshot: () => ({
            document: { type: "doc" },
            parts: [
              { type: "text", text: "Compare " },
              {
                type: "data-context-reference",
                data: {
                  kind: "issue",
                  id: "issue-1",
                  label: "Issue #1: Review tenant audit log",
                },
              },
              { type: "text", text: " today" },
            ],
          }),
        }))
        const updateDraft = React.useCallback(
          (event: ChangeEvent<HTMLTextAreaElement>) =>
            onDraftTextChange(event.target.value),
          [onDraftTextChange]
        )
        return (
          <textarea
            aria-label="Agent message"
            value={draftText}
            onChange={updateDraft}
          />
        )
      }
    ),
  }
})

describe("AgentNewThreadComposer", () => {
  it("fills a sample prompt without creating a thread", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn<(input: AgentNewThreadInput) => void>()
    render(
      <AgentNewThreadComposer
        organizationId="organization-1"
        disabled={false}
        creating={false}
        onCreate={onCreate}
      />
    )

    await user.click(
      screen.getByRole("button", {
        name: "Summarize the current page and suggest the next action.",
      })
    )

    expect(screen.getByRole("textbox", { name: "Agent message" })).toHaveValue(
      "Summarize the current page and suggest the next action."
    )
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox")).toHaveTextContent("Ask always")
  })

  it("keeps permission and inline mention data in the first thread handoff", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn<(input: AgentNewThreadInput) => void>()
    render(
      <AgentNewThreadComposer
        organizationId="organization-1"
        disabled={false}
        creating={false}
        onCreate={onCreate}
      />
    )

    const permission = screen.getByRole("combobox")
    await user.click(permission)
    await user.click(screen.getByRole("option", { name: /Full access/u }))

    const composer = await screen.findByRole("textbox", {
      name: "Agent message",
    })
    await user.type(composer, "Compare @Issue #1 today")
    await user.click(screen.getByRole("button", { name: "Send" }))

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        autoSubmit: true,
        files: [],
        permissionMode: "full_access",
        snapshot: expect.objectContaining({
          parts: [
            { type: "text", text: "Compare " },
            {
              type: "data-context-reference",
              data: {
                kind: "issue",
                id: "issue-1",
                label: "Issue #1: Review tenant audit log",
              },
            },
            { type: "text", text: " today" },
          ],
        }),
      })
    )
    expect(composer).toHaveValue("Compare @Issue #1 today")
  })
})
