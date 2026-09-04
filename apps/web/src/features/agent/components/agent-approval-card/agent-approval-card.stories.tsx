import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import type { AgentIssueAction } from "../../schema"
import {
  fictionalAgentIdentity,
  fictionalPendingAction,
} from "../../test-support/fixtures"
import { AgentApprovalCard } from "./agent-approval-card"

const meta = preview.meta({
  title: "Web/Agent/Approval Card",
  component: AgentApprovalCard,
  tags: ["autodocs"],
  args: {
    actionId: fictionalPendingAction.id,
    frozen: false,
    onPendingChange: fn(),
    organizationId: fictionalAgentIdentity.organizationId,
    organizationSlug: fictionalAgentIdentity.organizationSlug,
  },
})

export const Pending = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/actions/action-pending", () =>
        HttpResponse.json(fictionalPendingAction)
      )
    )
  },
  play: async ({ args, canvas, step }) => {
    await step("保留中の承認を親へ通知する", async () => {
      await canvas.findByRole("region", {
        name: "Issue change approval",
      })
      await waitFor(() =>
        expect(args.onPendingChange).toHaveBeenCalledWith(
          fictionalPendingAction.id,
          true
        )
      )
    })
  },
})

export const Reject = meta.story({
  beforeEach({ msw }) {
    let action: AgentIssueAction = fictionalPendingAction
    msw.use(
      http.get("*/agent/actions/action-pending", () =>
        HttpResponse.json(action)
      ),
      http.post("*/agent/actions/action-pending/decision", async () => {
        action = {
          ...fictionalPendingAction,
          status: "rejected",
          completedAt: "2026-07-26T09:45:00.000Z",
        }
        return HttpResponse.json(action)
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("提案された変更を拒否する", async () => {
      const approval = await canvas.findByRole("region", {
        name: "Issue change approval",
      })
      await userEvent.click(
        await within(approval).findByRole("button", { name: "No" })
      )
      await expect(await within(approval).findByText("rejected")).toBeVisible()
    })
  },
})

export const RetryAfterFailure = meta.story({
  beforeEach({ msw }) {
    let requestCount = 0
    msw.use(
      http.get("*/agent/actions/action-pending", () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(
              {
                error: "service_unavailable",
                message: "The service is temporarily unavailable.",
              },
              { status: 503 }
            )
          : HttpResponse.json(fictionalPendingAction)
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("承認詳細を決定的に復元する", async () => {
      const approval = await canvas.findByRole("region", {
        name: "Issue change approval",
      })
      await expect(
        await within(approval).findByRole("alert")
      ).toHaveTextContent("Approval details could not be loaded.")
      await userEvent.click(
        within(approval).getByRole("button", { name: "Try again" })
      )
      await expect(
        await within(approval).findByText("Approve Issue change?")
      ).toBeVisible()
    })
  },
})

export const Frozen = meta.story({
  args: { frozen: true },
  beforeEach({ msw }) {
    msw.use(
      http.get("*/agent/actions/action-pending", () =>
        HttpResponse.json(fictionalPendingAction)
      )
    )
  },
})
