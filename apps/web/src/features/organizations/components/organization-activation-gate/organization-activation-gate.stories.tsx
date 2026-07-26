import { http, HttpResponse } from "msw"
import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"
import {
  AgentFormRegistryProvider,
  AgentRuntimeProvider,
} from "@/features/agent"

import { OrganizationActivationGate } from "./organization-activation-gate"

const meta = preview.meta({
  title: "Web/Organizations/Activation Gate",
  component: OrganizationActivationGate,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <AgentFormRegistryProvider>
          <AgentRuntimeProvider
            userId="user_01K1AVERY00000000000000"
            organizationId="org_01K1ACMECLOUD0000000000"
          >
            <Story />
          </AgentRuntimeProvider>
        </AgentFormRegistryProvider>
      </Providers>
    ),
  ],
  args: {
    organizationId: "org_01K1BETALABS00000000000",
    organizationName: "Beta Labs",
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  beforeEach({ msw }) {
    msw.use(
      http.post("*/organizations/:organizationId/activate", () =>
        HttpResponse.json({ active: true })
      )
    )
  },
  play: async ({ canvas, step }) => {
    await step("Switch to the requested organization", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Switch and continue" })
      )
      await expect(
        await canvas.findByText("Organization switched")
      ).toBeInTheDocument()
    })
  },
})
