import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { fictionalSessions } from "../../test-support/fixtures"
import { SessionsPanel } from "./sessions-panel"
import { SessionsPanelStoryFixture } from "./test-support/sessions-panel-story-fixture"

const meta = preview.meta({
  title: "Web/Account/Sessions Panel",
  component: SessionsPanel,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </Providers>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.get("*/me/sessions", () => HttpResponse.json(fictionalSessions))
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("現在以外の全セッションの取り消しをキャンセルする", async () => {
      const trigger = await canvas.findByRole("button", {
        name: "Revoke other sessions",
      })
      await waitFor(() => expect(trigger).toBeEnabled())
      await userEvent.click(trigger)
      await expect(
        body.getByRole("alertdialog", {
          name: "Revoke every other session?",
        })
      ).toBeInTheDocument()
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", {
            name: "Revoke every other session?",
          })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const Empty = meta.story({
  beforeEach({ msw }) {
    msw.use(http.get("*/me/sessions", () => HttpResponse.json([])))
  },
})

export const RetrySuccess = meta.story({
  beforeEach({ msw }) {
    let attempt = 0
    msw.use(
      http.get("*/me/sessions", () => {
        attempt += 1
        return attempt === 1
          ? HttpResponse.json(
              {
                error: "validation_error",
                message: "Temporary session failure.",
              },
              { status: 400 }
            )
          : HttpResponse.json(fictionalSessions)
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("失敗したセッション取得を再試行する", async () => {
      await expect(
        await canvas.findByText("Sessions could not be loaded")
      ).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
      await expect(
        await canvas.findByRole("row", { name: /iPhone/ })
      ).toBeInTheDocument()
    })
  },
})

export const MobileOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <SessionsPanelStoryFixture />,
})
