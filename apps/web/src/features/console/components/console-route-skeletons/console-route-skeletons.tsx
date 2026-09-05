import { RouteLoading } from "@/components/app-state/app-state"

export const DashboardRouteSkeleton = () => (
  <RouteLoading
    label="Loading organization dashboard"
    showAction
    variant="dashboard"
  />
)

export const IssuesRouteSkeleton = () => (
  <RouteLoading label="Loading organization issues" variant="issues" />
)

export const MembersRouteSkeleton = () => (
  <RouteLoading label="Loading organization members" variant="members" />
)

export const OrganizationSettingsRouteSkeleton = () => (
  <RouteLoading
    label="Loading organization settings"
    variant="organization-settings"
  />
)

export const AccountSettingsRouteSkeleton = () => (
  <RouteLoading label="Loading account settings" variant="form" />
)

export const OrganizationsRouteSkeleton = () => (
  <RouteLoading label="Loading organizations" showAction variant="table" />
)

export const OnboardingRouteSkeleton = () => (
  <RouteLoading label="Loading onboarding" variant="form" />
)
