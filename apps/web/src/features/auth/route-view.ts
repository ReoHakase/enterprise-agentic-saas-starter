import { type AuthView, viewPaths } from "@better-auth-ui/core"
import { magicLinkPlugin } from "@better-auth-ui/core/plugins"

const supportedAuthRoutes = [
  { path: viewPaths.auth.signIn, view: "signIn" },
  { path: viewPaths.auth.signOut, view: "signOut" },
  { path: viewPaths.auth.signUp, view: "signUp" },
  { path: viewPaths.auth.forgotPassword, view: "forgotPassword" },
  { path: viewPaths.auth.resetPassword, view: "resetPassword" },
  {
    path: magicLinkPlugin().viewPaths?.auth?.magicLink,
    view: "magicLink",
  },
] as const satisfies ReadonlyArray<{ path: string | undefined; view: AuthView }>

/** Resolve the public route segment before rendering the Better Auth UI view. */
export const resolveAuthRouteView = (path: string): AuthView => {
  const route = supportedAuthRoutes.find((candidate) => candidate.path === path)

  if (!route) {
    throw new Error(`[Better Auth UI] Unknown view path "${path}"`)
  }

  return route.view
}
