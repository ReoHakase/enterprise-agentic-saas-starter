import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { fictionalOrganization } from "../../test-support/fixtures"
import { OrganizationSettingsForm } from "./organization-settings-form"

const meta = preview.meta({
  title: "Web/Organizations/Organization Settings",
  component: OrganizationSettingsForm,
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
  args: { organization: fictionalOrganization },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Validate the organization slug locally", async () => {
      const slug = canvas.getByRole("textbox", { name: "Slug" })
      await userEvent.clear(slug)
      await userEvent.type(slug, "Invalid Slug")
      await userEvent.click(
        canvas.getByRole("button", { name: "Save changes" })
      )
      await expect(slug).toBeInvalid()
      await expect(
        canvas.getByText("Use lowercase letters, numbers, and single hyphens.")
      ).toBeVisible()
    })
  },
})

export const LongIdentity = meta.story({
  args: {
    organization: {
      ...fictionalOrganization,
      name: "Acme International Platform Reliability and Automation",
      slug: "acme-international-platform-reliability",
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", {
        name: "Acme International Platform Reliability and Automation",
      })
    ).toBeVisible()
  },
})
