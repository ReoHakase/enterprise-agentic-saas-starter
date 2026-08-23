export { safeAuthErrorCode, safeAuthErrorMessage } from "./error"
export { createAuthCallbackURL } from "./callback-url"
export { Auth } from "./components/auth/client"
export { AuthProvider } from "./components/auth-provider/auth-provider"
export { AuthRouteScope } from "./components/auth-route-scope/auth-route-scope"
export { createInvitationPath } from "./invitation-path"
export { magicLinkPlugin } from "./magic-link-plugin"
export { clearAuthenticatedQueryCache } from "./query-cache"
export { sanitizeAuthRedirectTo } from "./redirect-to"
export {
  requireMultiSessionAuthClient,
  requirePasskeyAuthClient,
} from "./runtime-guards"
export {
  createResetPasswordFormSchema,
  createSignInFormSchema,
  createSignUpFormSchema,
  forgotPasswordFormSchema,
  magicLinkFormSchema,
} from "./schema"
