import { MCP_OAUTH_SCOPES } from "@enterprise-agentic-saas/auth/client"

import { fictionalOrganizations } from "../../../../organizations/test-support/fixtures"
import { parseMcpOAuthScopes } from "../../../query"
import { McpOAuthConsentView } from "../mcp-oauth-authorization"

const consentScopes = parseMcpOAuthScopes(MCP_OAUTH_SCOPES.join(" ")) ?? []
const currentUser = {
  id: "user-current",
  name: "Current User",
  email: "current@example.test",
  profileImage: null,
}
const ignoreDecision = () => undefined

export const McpOAuthScopeConsentStoryFixture = () => (
  <div className="mx-auto flex w-full min-w-0 justify-center">
    <McpOAuthConsentView
      addAccountHref="/auth/sign-in?add_account=1&redirectTo=%2Foauth%2Fconsent"
      currentUser={currentUser}
      organization={fictionalOrganizations[0]}
      pending={false}
      returnTo="/oauth/consent"
      scopes={consentScopes}
      onDecision={ignoreDecision}
    />
  </div>
)
