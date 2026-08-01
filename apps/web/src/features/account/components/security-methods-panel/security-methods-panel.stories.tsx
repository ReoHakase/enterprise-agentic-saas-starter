import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { SecurityMethodsPanel } from "./security-methods-panel"

const meta = preview.meta({
  title: "Web/Account/Security Methods",
  component: SecurityMethodsPanel,
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
      http.get("*/auth/list-accounts", () =>
        HttpResponse.json([
          {
            id: "account_01K1GITHUB0000000000",
            accountId: "github_avery_story",
            providerId: "github",
            createdAt: "2026-07-20T09:00:00.000Z",
          },
        ])
      ),
      http.get("*/auth/passkey/list-user-passkeys", () =>
        HttpResponse.json([
          {
            id: "passkey_01K1MACBOOK000000000",
            name: "Avery's MacBook",
            createdAt: "2026-07-21T10:00:00.000Z",
            deviceType: "singleDevice",
            backedUp: true,
          },
        ])
      )
    )
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Review and cancel passkey deletion", async () => {
      await expect(await canvas.findByText("Avery's MacBook")).toBeVisible()
      await userEvent.click(canvas.getByRole("button", { name: "Delete" }))
      await expect(body.getByRole("alertdialog")).toBeInTheDocument()
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(body.queryByRole("alertdialog")).not.toBeInTheDocument()
      )
    })
  },
})

export const NoPasskeys = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/list-accounts", () => HttpResponse.json([])),
      http.get("*/auth/passkey/list-user-passkeys", () => HttpResponse.json([]))
    )
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No passkeys are registered yet.")
    ).toBeVisible()
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/list-accounts", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      ),
      http.get("*/auth/passkey/list-user-passkeys", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    )
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Security methods could not be loaded")
    ).toBeVisible()
  },
})
