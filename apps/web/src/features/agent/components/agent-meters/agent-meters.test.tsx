import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import type { AgentChatMessage } from "../../schema"
import { AgentMeters } from "./agent-meters"

const budgetMessage = (observedInputTokens: number | null) =>
  ({
    id: "message-budget",
    role: "assistant",
    parts: [
      {
        type: "data-context-budget",
        data: {
          contextWindowTokens: 1_000_000,
          reservedOutputTokens: 4_096,
          estimated: {
            system: 2_000,
            skills: 3_000,
            tools: 6_000,
            history: 1_000,
            pageContext: 500,
            attachments: 2,
            total: 12_502,
          },
          observedInputTokens,
          level: "normal",
        },
      },
    ],
  }) satisfies AgentChatMessage

const observedMessages = [budgetMessage(5_168)]
const estimatedMessages = [budgetMessage(null)]

describe("AgentMeters", () => {
  it("uses the last provider observation as the primary context value", async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <AgentMeters streamedMessages={observedMessages} />
      </TooltipProvider>
    )

    const trigger = screen.getByRole("button", {
      name: "Last request context 1% used",
    })
    await user.hover(trigger)

    expect(await screen.findByText("Last request actual")).toBeVisible()
    expect(screen.getByText("5,168 / 1,000,000")).toBeVisible()
    expect(screen.getByText("Preflight estimate")).toBeVisible()
    expect(screen.getByText("12,502")).toBeVisible()
    expect(screen.getByText("Estimated breakdown")).toBeVisible()
  })

  it("labels the preflight estimate when no provider observation exists", async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <AgentMeters streamedMessages={estimatedMessages} />
      </TooltipProvider>
    )

    const trigger = screen.getByRole("button", {
      name: "Estimated context 1% used",
    })
    await user.hover(trigger)

    expect(await screen.findByText("Estimated context")).toBeVisible()
    expect(
      screen.getByText(
        "No provider result yet. Showing the preflight estimate."
      )
    ).toBeVisible()
    expect(screen.queryByText("Last request actual")).not.toBeInTheDocument()
  })
})
