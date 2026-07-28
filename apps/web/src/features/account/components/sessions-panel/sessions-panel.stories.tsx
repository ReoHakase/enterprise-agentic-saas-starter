import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { fictionalSessions } from "../../test-support/fixtures"
import { SessionsPanel } from "./sessions-panel"

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
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Cancel revoking every other session", async () => {
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
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No active sessions")).toBeVisible()
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
              { message: "Temporary session failure." },
              { status: 400 }
            )
          : HttpResponse.json(fictionalSessions)
      })
    )
  },
  play: async ({ canvas, step }) => {
    await step("Retry a failed sessions request", async () => {
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
  beforeEach({ msw }) {
    msw.use(
      http.get("*/me/sessions", () => HttpResponse.json(fictionalSessions))
    )
  },
  play: async ({ canvas, canvasElement }) => {
    const table = await canvas.findByRole("table", {
      name: "Signed-in device sessions",
    })
    await expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
    ).toEqual([
      "Device",
      "Browser",
      "User-Agent",
      "Updated at",
      "Expires at",
      "Actions",
    ])
    await expect(
      table.closest('[data-slot="data-table-root"]')
    ).toBeInTheDocument()

    const scrollRegion = await canvas.findByRole("region", {
      name: "Signed-in device sessions",
    })
    await expect(scrollRegion).toHaveAttribute(
      "data-horizontal-overflow",
      "true"
    )
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    scrollRegion.scrollLeft = 40
    expect(scrollRegion.scrollLeft).toBeGreaterThan(0)

    const document = canvasElement.ownerDocument.documentElement
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    expect(document.scrollWidth).toBeLessThanOrEqual(document.clientWidth)
  },
})
