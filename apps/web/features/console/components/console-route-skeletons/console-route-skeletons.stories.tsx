import { fn } from "storybook/test"

import preview from "#storybook/preview"

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

const meta = preview.meta({
  title: "Console/Route Skeletons",
  component: DashboardRouteSkeleton,
  tags: ["autodocs", "theme-sensitive"],
  parameters: { layout: "fullscreen" },
})

export const Dashboard = meta.story({})

export const GenericConsoleRoute = meta.story({
  render: () => <ConsoleRouteSkeleton />,
})

export const Issues = meta.story({
  render: () => <IssuesRouteSkeleton />,
})

export const Members = meta.story({
  render: () => <MembersRouteSkeleton />,
})

export const OrganizationSettings = meta.story({
  render: () => <OrganizationSettingsRouteSkeleton />,
})

export const AccountSettings = meta.story({
  render: () => <AccountSettingsRouteSkeleton />,
})

export const Organizations = meta.story({
  render: () => <OrganizationsRouteSkeleton />,
})

export const Onboarding = meta.story({
  render: () => <OnboardingRouteSkeleton />,
})

export const RouteFailure = meta.story({
  render: () => (
    <ConsoleRouteErrorBoundary
      error={new Error("Storybook route failure")}
      reset={fn()}
    />
  ),
})
