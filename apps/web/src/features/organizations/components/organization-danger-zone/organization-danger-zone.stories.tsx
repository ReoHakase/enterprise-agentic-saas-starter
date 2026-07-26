import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import {
  fictionalOrganization,
  fictionalReadOnlyOrganization,
} from "../../test-support/fixtures"
import { OrganizationDangerZone } from "./organization-danger-zone"

const meta = preview.meta({
  title: "Web/Organizations/Organization Danger Zone",
  component: OrganizationDangerZone,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto max-w-4xl">
          <Story />
        </div>
      </Providers>
    ),
  ],
  args: { organization: fictionalOrganization },
})

export const SuperAdmin = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Require both destructive confirmations", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Delete organization" })
      )
      const dialog = body.getByRole("alertdialog", {
        name: "Delete Acme Cloud?",
      })
      await userEvent.type(
        within(dialog).getByRole("textbox", {
          name: "Type the organization slug",
        }),
        "acme"
      )
      await expect(
        within(dialog).getByRole("button", { name: "Permanently delete" })
      ).toBeDisabled()
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Delete Acme Cloud?" })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const PermissionLimited = meta.story({
  args: { organization: fictionalReadOnlyOrganization },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Sensitive controls")).toBeVisible()
    await expect(
      canvas.queryByRole("button", { name: "Delete organization" })
    ).not.toBeInTheDocument()
  },
})
