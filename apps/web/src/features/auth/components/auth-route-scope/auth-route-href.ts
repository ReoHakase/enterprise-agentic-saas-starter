export type AuthRouteState = {
  addingAccount: boolean
  reauthenticating: boolean
  redirectTo: string
}

export const createScopedAuthViewHref = ({
  basePath,
  preserveReauthentication = false,
  route,
  viewPath,
}: {
  basePath: string
  preserveReauthentication?: boolean
  route?: AuthRouteState
  viewPath: string
}) => {
  const pathname = `${basePath}/${viewPath}`
  if (!route) return pathname

  const query = new URLSearchParams({ redirectTo: route.redirectTo })
  if (route.addingAccount) query.set("add_account", "1")
  if (preserveReauthentication && route.reauthenticating) {
    query.set("reauth", "1")
  }
  return `${pathname}?${query.toString()}`
}
