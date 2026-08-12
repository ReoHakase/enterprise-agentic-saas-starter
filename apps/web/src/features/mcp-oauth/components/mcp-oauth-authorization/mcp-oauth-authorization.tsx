import { MCP_OAUTH_SCOPES } from "@enterprise-agentic-saas/auth/client"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { Building2Icon, KeyRoundIcon, Repeat2Icon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { UserIdentity } from "@/components/user-identity/user-identity"
import { AccountSwitcherDialog, type Me } from "@/features/account"
import {
  OrganizationIdentity,
  OrganizationRoleBadge,
  OrganizationsTable,
  type OrganizationSummary,
} from "@/features/organizations"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import type { McpOAuthGrantedScope, McpOAuthScopeSummary } from "../../query"
import { McpOAuthScopeMatrix } from "../mcp-oauth-scope-matrix/mcp-oauth-scope-matrix"

const mcpOAuthScopeSet = new Set<string>(MCP_OAUTH_SCOPES)
const isMcpOAuthGrantedScope = (value: string): value is McpOAuthGrantedScope =>
  value === "offline_access" || mcpOAuthScopeSet.has(value)

export type McpOAuthOrganizationOption = OrganizationSummary

const McpOAuthOrganizationAction = ({
  disabled,
  onSelect,
  organization,
  pending,
}: {
  disabled: boolean
  onSelect: (organizationId: string) => void
  organization: McpOAuthOrganizationOption
  pending: boolean
}) => {
  const hydrated = useIsHydrated()
  const selectOrganization = useCallback(
    () => onSelect(organization.id),
    [onSelect, organization.id]
  )

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || !hydrated}
      onClick={selectOrganization}
      aria-label={`Continue with ${organization.name}`}
    >
      {pending ? (
        <Spinner data-icon="inline-start" aria-label="Selecting organization" />
      ) : null}
      Continue
    </Button>
  )
}

const McpOAuthCurrentAccount = ({
  addAccountHref,
  currentUser,
  returnTo,
}: {
  addAccountHref: string
  currentUser: Me["user"]
  returnTo: string
}) => {
  const hydrated = useIsHydrated()
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false)
  const openAccountSwitcher = useCallback(() => {
    setAccountSwitcherOpen(true)
  }, [])

  return (
    <>
      <section
        aria-label="Current account"
        className="flex flex-wrap items-center gap-4 rounded-2xl border bg-muted/35 p-4"
      >
        <div className="min-w-0 flex-1 basis-48">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Current account
          </p>
          <UserIdentity user={currentUser} />
        </div>
        <Button
          variant="outline"
          disabled={!hydrated}
          onClick={openAccountSwitcher}
        >
          <Repeat2Icon data-icon="inline-start" aria-hidden="true" />
          Switch account
        </Button>
      </section>
      {accountSwitcherOpen ? (
        <AccountSwitcherDialog
          addAccountHref={addAccountHref}
          allowRemove={false}
          currentUser={currentUser}
          open
          onOpenChange={setAccountSwitcherOpen}
          returnTo={returnTo}
        />
      ) : null}
    </>
  )
}

export const McpOAuthOrganizationView = ({
  addAccountHref,
  currentUser,
  organizations,
  pendingOrganizationId,
  returnTo,
  onSelect,
}: {
  addAccountHref: string
  currentUser: Me["user"]
  organizations: readonly McpOAuthOrganizationOption[]
  pendingOrganizationId?: string
  returnTo: string
  onSelect: (organizationId: string) => void
}) => {
  const renderOrganizationAction = useCallback(
    (organization: McpOAuthOrganizationOption) => (
      <McpOAuthOrganizationAction
        disabled={pendingOrganizationId !== undefined}
        onSelect={onSelect}
        organization={organization}
        pending={pendingOrganizationId === organization.id}
      />
    ),
    [onSelect, pendingOrganizationId]
  )

  return (
    <>
      <Card className="w-min min-w-0">
        <CardHeader className="grid grid-cols-[auto_1fr] gap-x-4 text-left">
          <span className="row-span-2 flex size-10 items-center justify-center rounded-xl bg-muted">
            <Building2Icon aria-hidden="true" />
          </span>
          <CardTitle>Choose an organization</CardTitle>
          <CardDescription>
            This MCP credential will be restricted to one organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <McpOAuthCurrentAccount
            addAccountHref={addAccountHref}
            currentUser={currentUser}
            returnTo={returnTo}
          />

          {organizations.length > 0 ? (
            <OrganizationsTable
              caption="Organizations available for this MCP credential"
              compact
              organizations={organizations}
              renderActions={renderOrganizationAction}
            />
          ) : (
            <p role="alert" className="text-sm text-muted-foreground">
              No organization is available for this account.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export const McpOAuthConsentView = ({
  addAccountHref,
  currentUser,
  organization,
  pending,
  returnTo,
  scopes,
  onDecision,
}: {
  addAccountHref: string
  currentUser: Me["user"]
  organization?: McpOAuthOrganizationOption
  pending: boolean
  returnTo: string
  scopes: readonly McpOAuthScopeSummary[] | null
  onDecision: (
    accept: boolean,
    scopes?: readonly McpOAuthGrantedScope[]
  ) => void
}) => {
  const hydrated = useIsHydrated()
  const [selectedScopes, setSelectedScopes] = useState<McpOAuthGrantedScope[]>(
    () => scopes?.map(({ scope }) => scope) ?? []
  )
  const scopeSelectionKey = scopes?.map(({ scope }) => scope).join("\u0000")
  const previousScopeSelectionKey = useRef(scopeSelectionKey)
  useEffect(() => {
    if (previousScopeSelectionKey.current === scopeSelectionKey) return
    previousScopeSelectionKey.current = scopeSelectionKey
    setSelectedScopes(
      scopeSelectionKey
        ? scopeSelectionKey.split("\u0000").filter(isMcpOAuthGrantedScope)
        : []
    )
  }, [scopeSelectionKey])
  const hasPermissionScope = selectedScopes.some(
    (scope) => scope !== "offline_access"
  )
  const deny = useCallback(() => onDecision(false), [onDecision])
  const allow = useCallback(() => {
    if (hasPermissionScope) onDecision(true, selectedScopes)
  }, [hasPermissionScope, onDecision, selectedScopes])

  return (
    <Card className="w-min min-w-0">
      <CardHeader className="grid grid-cols-[auto_1fr] gap-x-4 text-left">
        <span className="row-span-2 flex size-10 items-center justify-center rounded-xl bg-muted">
          <KeyRoundIcon aria-hidden="true" />
        </span>
        <CardTitle>Authorize MCP access</CardTitle>
        <CardDescription>
          Review the access requested by this MCP client.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <McpOAuthCurrentAccount
          addAccountHref={addAccountHref}
          currentUser={currentUser}
          returnTo={returnTo}
        />
        {organization ? (
          <section
            aria-label="Selected organization"
            className="flex flex-wrap items-center gap-4 rounded-2xl border bg-muted/35 p-4"
          >
            <div className="min-w-0 flex-1 basis-48">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Selected organization
              </p>
              <OrganizationIdentity organization={organization} />
            </div>
            <OrganizationRoleBadge role={organization.role} />
          </section>
        ) : null}
        {scopes ? (
          <McpOAuthScopeMatrix
            onChange={setSelectedScopes}
            readOnly={!hydrated}
            requestedScopes={scopes}
            selectedScopes={selectedScopes}
          />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            This authorization request is invalid or no longer available.
          </p>
        )}
        {scopes && !hasPermissionScope ? (
          <p role="alert" className="text-sm text-destructive">
            Select at least one permission before allowing access.
          </p>
        ) : null}
      </CardContent>
      {scopes ? (
        <CardFooter className="justify-end gap-2">
          <Button
            variant="outline"
            className="min-w-28"
            disabled={pending || !hydrated}
            onClick={deny}
          >
            Deny
          </Button>
          <Button
            className="min-w-28"
            disabled={pending || !hydrated || !hasPermissionScope}
            onClick={allow}
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Allow
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
