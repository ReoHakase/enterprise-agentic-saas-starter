import type { OrganizationSummary } from "./schema"

const organizationRoutePattern = /^\/organization\/([^/]+)(?:\/|$)/

export const resolveOrganizationRouteContext = (
  pathname: string,
  organizations: OrganizationSummary[]
) => {
  const activeOrganization = organizations.find(
    (organization) => organization.active
  )
  const routeOrganizationSlug = pathname.match(organizationRoutePattern)?.[1]
  const routeOrganization = routeOrganizationSlug
    ? organizations.find(
        (organization) => organization.slug === routeOrganizationSlug
      )
    : undefined
  const contextOrganization = routeOrganizationSlug
    ? routeOrganization
    : activeOrganization

  return {
    activeOrganization,
    contextOrganization,
    contextMismatch: Boolean(
      routeOrganizationSlug &&
      (!routeOrganization ||
        !activeOrganization ||
        routeOrganization.id !== activeOrganization.id)
    ),
  }
}
