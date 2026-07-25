import type { Meta, StoryObj } from "@storybook/react-vite"

import { Providers } from "@/components/providers/providers"
import {
  AgentFormRegistryProvider,
  AgentRuntimeProvider,
} from "@/features/agent"

import type { OrganizationDetail, OrganizationSummary } from "../../schema"
import { OrganizationActivationGate } from "../organization-activation-gate/organization-activation-gate"
import { OrganizationDangerZone } from "../organization-danger-zone/organization-danger-zone"
import { OrganizationSettingsForm } from "../organization-settings-form/organization-settings-form"
import { OrganizationsPage } from "../organizations-page/organizations-page"

const permissions = {
  canEditOrganization: true,
  canInviteMembers: true,
  canManageMembers: true,
  canManageAdmins: true,
  canTransferSuperAdmin: true,
}
const organizations: OrganizationSummary[] = [
  {
    id: "org-acme",
    name: "Acme Cloud",
    slug: "acme",
    role: "super_admin",
    active: true,
    profileImage: null,
    memberCount: 4,
    memberProfileImages: [],
    permissions,
  },
  {
    id: "org-beta",
    name: "Beta Labs",
    slug: "beta",
    role: "admin",
    active: false,
    profileImage: null,
    memberCount: 3,
    memberProfileImages: [],
    permissions,
  },
]
const organization: OrganizationDetail = {
  id: "org-acme",
  name: "Acme Cloud",
  slug: "acme",
  role: "super_admin",
  active: true,
  profileImage: null,
  memberCount: 4,
  memberProfileImages: [],
  permissions,
  createdAt: "2026-07-20T09:00:00.000Z",
  invitationCount: 1,
}

const OrganizationStoryFrame = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <Providers>
    <AgentFormRegistryProvider>
      <AgentRuntimeProvider userId="user-1" organizationId="org-acme">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </AgentRuntimeProvider>
    </AgentFormRegistryProvider>
  </Providers>
)

const meta = {
  title: "Web/Organizations/Component Catalogue",
  component: OrganizationStoryFrame,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OrganizationStoryFrame>

export default meta
type Story = StoryObj<typeof meta>

export const OrganizationList: Story = {
  args: { children: null },
  render: () => (
    <OrganizationStoryFrame>
      <OrganizationsPage initialOrganizations={organizations} />
    </OrganizationStoryFrame>
  ),
}

export const OrganizationSettings: Story = {
  args: { children: null },
  render: () => (
    <OrganizationStoryFrame>
      <OrganizationSettingsForm organization={organization} />
    </OrganizationStoryFrame>
  ),
}

export const OrganizationDeletionBoundary: Story = {
  args: { children: null },
  render: () => (
    <OrganizationStoryFrame>
      <OrganizationDangerZone organization={organization} />
    </OrganizationStoryFrame>
  ),
}

export const InactiveOrganization: Story = {
  args: { children: null },
  render: () => (
    <OrganizationStoryFrame>
      <OrganizationActivationGate
        organizationId="org-beta"
        organizationName="Beta Labs"
      />
    </OrganizationStoryFrame>
  ),
}
