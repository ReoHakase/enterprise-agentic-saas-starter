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

export const Owner = meta.story({
  tags: ["theme-sensitive"],
})

export const PermissionLimited = meta.story({
  args: { organization: fictionalReadOnlyOrganization },
})
