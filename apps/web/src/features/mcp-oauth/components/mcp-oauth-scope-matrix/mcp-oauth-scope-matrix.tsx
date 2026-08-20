"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { useCallback, useId, useMemo } from "react"

import {
  mcpOAuthScopeMatrixRows,
  mcpOAuthScopeOperations,
  sortMcpOAuthScopes,
  type McpOAuthGrantedScope,
  type McpOAuthScopeMatrixRow,
  type McpOAuthScopeSummary,
} from "../../query"

const getGroupState = (
  scopes: readonly string[],
  selectedScopes: ReadonlySet<string>
) => {
  const selectedCount = scopes.filter((scope) =>
    selectedScopes.has(scope)
  ).length
  return {
    checked: selectedCount === scopes.length && scopes.length > 0,
    indeterminate: selectedCount > 0 && selectedCount < scopes.length,
  }
}

const getRequestedRowScopes = (
  row: McpOAuthScopeMatrixRow,
  requestedScopes: ReadonlySet<string>
) =>
  mcpOAuthScopeOperations.flatMap((operation) => {
    const scope = row.scopes[operation.id]
    return scope && requestedScopes.has(scope) ? [scope] : []
  })

const getRequestedOperationScopes = (
  operationId: (typeof mcpOAuthScopeOperations)[number]["id"],
  requestedScopes: ReadonlySet<string>
) =>
  mcpOAuthScopeMatrixRows.flatMap((row) => {
    const scope = row.scopes[operationId]
    return scope && requestedScopes.has(scope) ? [scope] : []
  })

const scopeCellCheckboxClassName =
  "mx-auto size-5 border-2 border-foreground/35 bg-background shadow-xs disabled:opacity-60"
const scopeTargetClassName = "w-28 p-2 pr-2!"
const scopeOperationClassName = "w-13 p-1 pr-1! text-center"

export const McpOAuthScopeMatrix = ({
  onChange,
  readOnly = false,
  requestedScopes,
  selectedScopes,
}: {
  onChange?: (scopes: McpOAuthGrantedScope[]) => void
  readOnly?: boolean
  requestedScopes: readonly McpOAuthScopeSummary[]
  selectedScopes: readonly McpOAuthGrantedScope[]
}) => {
  const requestedSet = useMemo(
    () => new Set(requestedScopes.map(({ scope }) => scope)),
    [requestedScopes]
  )
  const selectedSet = useMemo(() => new Set(selectedScopes), [selectedScopes])
  const grantedScopes = useMemo(
    () => sortMcpOAuthScopes(selectedScopes),
    [selectedScopes]
  )
  const canChange = !readOnly && onChange !== undefined

  const updateScopes = useCallback(
    (scopes: readonly McpOAuthGrantedScope[], checked: boolean) => {
      if (!canChange || !onChange) return
      const next = new Set(selectedSet)
      for (const scope of scopes) {
        if (checked) next.add(scope)
        else next.delete(scope)
      }
      onChange(sortMcpOAuthScopes([...next]))
    },
    [canChange, onChange, selectedSet]
  )

  const toggleScope = useCallback(
    (scope: McpOAuthGrantedScope, checked: boolean) => {
      updateScopes([scope], checked)
    },
    [updateScopes]
  )

  const toggleOfflineAccess = useCallback(
    (checked: boolean) => updateScopes(["offline_access"], checked),
    [updateScopes]
  )
  const handleOfflineAccessChange = useCallback(
    (value: boolean | "indeterminate") => toggleOfflineAccess(value === true),
    [toggleOfflineAccess]
  )
  const offlineAccessId = useId()

  return (
    <div className="flex flex-col gap-4">
      <Table
        className="w-auto min-w-93 table-fixed"
        containerClassName="rounded-xl border"
        scrollLabel="Requested access"
      >
        <TableCaption className="sr-only">Requested access</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className={scopeTargetClassName} scope="col">
              Target
            </TableHead>
            {mcpOAuthScopeOperations.map((operation) => {
              const scopes = getRequestedOperationScopes(
                operation.id,
                requestedSet
              )
              const state = getGroupState(scopes, selectedSet)
              return (
                <TableHead
                  key={operation.id}
                  className={scopeOperationClassName}
                  scope="col"
                >
                  <ScopeGroupCheckbox
                    displayLabel={operation.label}
                    label={`Toggle all ${operation.label} access`}
                    scopes={scopes}
                    checked={state.checked}
                    disabled={!canChange || scopes.length === 0}
                    indeterminate={state.indeterminate}
                    stacked
                    updateScopes={updateScopes}
                  />
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {mcpOAuthScopeMatrixRows.map((row) => {
            const scopes = getRequestedRowScopes(row, requestedSet)
            const state = getGroupState(scopes, selectedSet)
            return (
              <TableRow key={row.id}>
                <TableCell className={scopeTargetClassName}>
                  <ScopeGroupCheckbox
                    displayLabel={row.label}
                    label={`Toggle all ${row.label} access`}
                    scopes={scopes}
                    checked={state.checked}
                    disabled={!canChange || scopes.length === 0}
                    indeterminate={state.indeterminate}
                    updateScopes={updateScopes}
                  />
                </TableCell>
                {mcpOAuthScopeOperations.map((operation) => {
                  const scope = row.scopes[operation.id]
                  const requested =
                    scope !== undefined && requestedSet.has(scope)
                  return (
                    <TableCell
                      key={operation.id}
                      className={scopeOperationClassName}
                    >
                      {requested && scope ? (
                        <ScopeCellCheckbox
                          label={`${row.label} ${operation.label} access`}
                          scope={scope}
                          checked={selectedSet.has(scope)}
                          disabled={!canChange}
                          toggleScope={toggleScope}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground"
                        >
                          —
                        </span>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <section aria-label="Permissions to grant" className="space-y-2">
        <p className="text-sm font-medium">Permissions to grant</p>
        {grantedScopes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {grantedScopes.map((scope) => (
              <Badge key={scope} variant="secondary">
                <code>{scope}</code>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No permissions selected.
          </p>
        )}
      </section>

      {requestedSet.has("offline_access") ? (
        <label
          className="flex items-start gap-3 rounded-lg border p-3 text-sm"
          htmlFor={offlineAccessId}
        >
          <Checkbox
            id={offlineAccessId}
            aria-label="Keep access after the client is closed"
            checked={selectedSet.has("offline_access")}
            disabled={!canChange}
            onCheckedChange={handleOfflineAccessChange}
          />
          <span>
            <span className="block font-medium">
              Keep access after the client is closed
            </span>
            <span className="block text-muted-foreground">
              Allows the client to request a refresh token.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  )
}

const ScopeGroupCheckbox = ({
  checked,
  disabled,
  displayLabel,
  indeterminate,
  label,
  scopes,
  stacked = false,
  updateScopes,
}: {
  checked: boolean
  disabled: boolean
  displayLabel: string
  indeterminate: boolean
  label: string
  scopes: readonly McpOAuthGrantedScope[]
  stacked?: boolean
  updateScopes: (
    scopes: readonly McpOAuthGrantedScope[],
    checked: boolean
  ) => void
}) => {
  const handleCheckedChange = useCallback(
    (value: boolean | "indeterminate") => updateScopes(scopes, value === true),
    [scopes, updateScopes]
  )
  const toggleGroup = useCallback(
    () => updateScopes(scopes, !checked),
    [checked, scopes, updateScopes]
  )
  return (
    <div
      className={
        stacked
          ? "inline-flex flex-col items-center gap-1 font-medium"
          : "inline-flex items-center gap-2 font-medium"
      }
    >
      <Checkbox
        aria-label={label}
        checked={checked}
        disabled={disabled}
        indeterminate={indeterminate}
        onCheckedChange={handleCheckedChange}
      />
      <button
        type="button"
        className={
          stacked
            ? "rounded-md px-1 py-0.5 text-xs font-medium hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
            : "rounded-md p-1 font-medium hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
        }
        disabled={disabled}
        onClick={toggleGroup}
      >
        {displayLabel}
      </button>
    </div>
  )
}

const ScopeCellCheckbox = ({
  checked,
  disabled,
  label,
  scope,
  toggleScope,
}: {
  checked: boolean
  disabled: boolean
  label: string
  scope: McpOAuthGrantedScope
  toggleScope: (scope: McpOAuthGrantedScope, checked: boolean) => void
}) => {
  const handleCheckedChange = useCallback(
    (value: boolean | "indeterminate") => toggleScope(scope, value === true),
    [scope, toggleScope]
  )
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      className={scopeCellCheckboxClassName}
      disabled={disabled}
      onCheckedChange={handleCheckedChange}
    />
  )
}
