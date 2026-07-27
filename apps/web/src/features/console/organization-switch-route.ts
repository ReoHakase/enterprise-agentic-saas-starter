const organizationRoutePattern =
  /^\/organization\/[^/]+\/(dashboard|issues|members|settings)(?:\/|$)/

export const rewriteOrganizationSwitchPathname = (
  pathname: string,
  organizationSlug: string
) => {
  const route = pathname.match(organizationRoutePattern)?.[1]
  return route ? `/organization/${organizationSlug}/${route}` : pathname
}
