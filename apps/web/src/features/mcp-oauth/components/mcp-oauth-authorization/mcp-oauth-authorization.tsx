import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
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
import { Building2Icon, KeyRoundIcon } from "lucide-react"
import { useCallback } from "react"

import { useIsHydrated } from "@/hooks/use-is-hydrated"

import type { McpOAuthScopeSummary } from "../../query"

export type McpOAuthOrganizationOption = {
  active: boolean
  id: string
  name: string
}

const McpOAuthOrganizationButton = ({
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
      className="h-auto justify-between py-3"
      disabled={disabled || !hydrated}
      onClick={selectOrganization}
    >
      <span className="min-w-0 truncate">{organization.name}</span>
      <span className="flex items-center gap-2">
        {organization.active ? (
          <Badge variant="secondary">Current</Badge>
        ) : null}
        {pending ? <Spinner aria-label="Selecting organization" /> : null}
      </span>
    </Button>
  )
}

export const McpOAuthOrganizationView = ({
  organizations,
  pendingOrganizationId,
  onSelect,
}: {
  organizations: readonly McpOAuthOrganizationOption[]
  pendingOrganizationId?: string
  onSelect: (organizationId: string) => void
}) => (
  <Card>
    <CardHeader className="items-center text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
        <Building2Icon aria-hidden="true" />
      </span>
      <CardTitle>Choose an organization</CardTitle>
      <CardDescription>
        This MCP credential will be restricted to one organization.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-2">
      {organizations.length > 0 ? (
        organizations.map((organization) => (
          <McpOAuthOrganizationButton
            key={organization.id}
            disabled={pendingOrganizationId !== undefined}
            onSelect={onSelect}
            organization={organization}
            pending={pendingOrganizationId === organization.id}
          />
        ))
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          No organization is available for this account.
        </p>
      )}
    </CardContent>
  </Card>
)

export const McpOAuthConsentView = ({
  pending,
  scopes,
  onDecision,
}: {
  pending: boolean
  scopes: readonly McpOAuthScopeSummary[] | null
  onDecision: (accept: boolean) => void
}) => {
  const hydrated = useIsHydrated()
  const deny = useCallback(() => onDecision(false), [onDecision])
  const allow = useCallback(() => onDecision(true), [onDecision])

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <KeyRoundIcon aria-hidden="true" />
        </span>
        <CardTitle>Authorize MCP access</CardTitle>
        <CardDescription>
          Review the access requested by this MCP client.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scopes ? (
          <ul
            aria-label="Requested access"
            className="flex flex-col gap-2 text-sm"
          >
            {scopes.map(({ description, scope }) => (
              <li key={scope} className="rounded-lg border px-3 py-2">
                {description}
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            This authorization request is invalid or no longer available.
          </p>
        )}
      </CardContent>
      {scopes ? (
        <CardFooter className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={pending || !hydrated}
            onClick={deny}
          >
            Deny
          </Button>
          <Button disabled={pending || !hydrated} onClick={allow}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Allow
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
