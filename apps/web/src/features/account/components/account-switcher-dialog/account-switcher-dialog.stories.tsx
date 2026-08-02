import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import {
  fictionalAccountUser,
  fictionalDeviceAccounts,
} from "../../test-support/fixtures"
import { AccountSwitcherDialog } from "./account-switcher-dialog"

const openChanged = fn()

const meta = preview.meta({
  title: "Web/Account/Account Switcher",
  component: AccountSwitcherDialog,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <Story />
      </Providers>
    ),
  ],
  args: {
    currentUser: fictionalAccountUser,
    open: true,
    onOpenChange: openChanged,
    returnTo: "/settings/account",
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    openChanged.mockClear()
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json(
          fictionalDeviceAccounts.map((account) => ({
            session: account.session,
            user: {
              id: account.user.id,
              name: account.user.name,
              email: account.user.email,
              image: account.user.profileImage,
            },
          }))
        )
      )
    )
  },
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Cancel removal of a device account", async () => {
      await userEvent.click(
        await body.findByRole("button", {
          name: "Remove jordan@example.test from this device",
        })
      )
      await expect(
        body.getByRole("alertdialog", {
          name: "Remove account from this device?",
        })
      ).toBeInTheDocument()
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", {
            name: "Remove account from this device?",
          })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const Empty = meta.story({
  play: async ({ canvasElement }) => {
    const emptyState = await within(
      canvasElement.ownerDocument.body
    ).findByText("No additional accounts")
    await waitFor(() => expect(emptyState).toBeVisible())
  },
})

export const ApiFailure = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/auth/multi-session/list-device-sessions", () =>
        HttpResponse.json({ message: "Unavailable" }, { status: 503 })
      )
    )
  },
  play: async ({ canvasElement }) => {
    const errorState = await within(
      canvasElement.ownerDocument.body
    ).findByText("Accounts could not be loaded")
    await waitFor(() => expect(errorState).toBeVisible())
  },
})
