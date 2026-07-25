import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { ConsoleRouteErrorBoundary } from "../console-route-error-boundary.client/console-route-error-boundary.client"
import {
  AccountSettingsRouteSkeleton,
  ConsoleRouteSkeleton,
  DashboardRouteSkeleton,
  IssuesRouteSkeleton,
  MembersRouteSkeleton,
  OnboardingRouteSkeleton,
  OrganizationsRouteSkeleton,
  OrganizationSettingsRouteSkeleton,
} from "./console-route-skeletons"

const meta = {
  title: "Console/Route Skeletons",
  component: DashboardRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DashboardRouteSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Dashboard: Story = {}

export const GenericConsoleRoute: Story = {
  render: () => <ConsoleRouteSkeleton />,
}

export const Issues: Story = {
  render: () => <IssuesRouteSkeleton />,
}

export const Members: Story = {
  render: () => <MembersRouteSkeleton />,
}

export const OrganizationSettings: Story = {
  render: () => <OrganizationSettingsRouteSkeleton />,
}

export const AccountSettings: Story = {
  render: () => <AccountSettingsRouteSkeleton />,
}

export const Organizations: Story = {
  render: () => <OrganizationsRouteSkeleton />,
}

export const Onboarding: Story = {
  render: () => <OnboardingRouteSkeleton />,
}

export const RouteFailure: Story = {
  render: () => (
    <ConsoleRouteErrorBoundary
      error={new Error("Storybook route failure")}
      reset={fn()}
    />
  ),
}
