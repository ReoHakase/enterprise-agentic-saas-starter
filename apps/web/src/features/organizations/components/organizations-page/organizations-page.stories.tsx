import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import {
  AgentFormRegistryProvider,
  AgentRuntimeProvider,
} from "@/features/agent"

import { fictionalOrganizations } from "../../test-support/fixtures"
import { OrganizationsPage } from "./organizations-page"

const OrganizationScope = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <AgentFormRegistryProvider>
      <AgentRuntimeProvider
        userId="user_01K1AVERY00000000000000"
        organizationId="org_01K1ACMECLOUD0000000000"
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </AgentRuntimeProvider>
    </AgentFormRegistryProvider>
  </Providers>
)

const meta = preview.meta({
  title: "Web/Organizations/Organizations Page",
  component: OrganizationsPage,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <OrganizationScope>
        <Story />
      </OrganizationScope>
    ),
  ],
  args: { initialOrganizations: fictionalOrganizations },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("Expose active and switchable tenant actions", async () => {
      await expect(
        canvas.getByRole("table", {
          name: "Organizations attached to your account",
        })
      ).toBeVisible()
      await expect(
        canvas.getByRole("button", { name: "Active" })
      ).toBeDisabled()
      await userEvent.tab()
      await expect(
        canvas.getByRole("button", { name: "Create organization" })
      ).toHaveFocus()
    })
  },
})

export const Empty = meta.story({
  args: { initialOrganizations: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Create your first organization")
    ).toBeVisible()
  },
})

export const MobileOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("region", {
        name: "Organizations attached to your account",
      })
    ).toBeInTheDocument()
  },
})
