import { http, HttpResponse } from "msw"
import { expect, fn, userEvent } from "storybook/test"

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
    await step("Review the typed canonical preview", async () => {
      await expect(
        await canvas.findByText("Approve Issue change?")
      ).toBeVisible()
      await expect(canvas.getByText("medium → high")).toBeVisible()
      await expect(canvas.getByText("tenant-policy.png")).toBeVisible()
      await expect(args.onPendingChange).toHaveBeenCalledWith(
        fictionalPendingAction.id,
        true
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
    await step("Reject the proposed change", async () => {
      await userEvent.click(await canvas.findByRole("button", { name: "No" }))
      await expect(await canvas.findByText("rejected")).toBeVisible()
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
          ? HttpResponse.json({ message: "Unavailable" }, { status: 503 })
          : HttpResponse.json(fictionalPendingAction)
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("Recover the approval details deterministically", async () => {
      await expect(await canvas.findByRole("alert")).toHaveTextContent(
        "Approval details could not be loaded."
      )
      await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
      await expect(
        await canvas.findByText("Approve Issue change?")
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
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Yes" })
    ).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "No" })).toBeDisabled()
  },
})
