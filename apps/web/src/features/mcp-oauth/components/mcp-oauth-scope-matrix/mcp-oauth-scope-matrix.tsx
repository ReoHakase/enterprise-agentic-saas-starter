"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import {
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type HeaderContext,
  type Table,
} from "@tanstack/react-table"
import { useCallback, useId, useMemo } from "react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"

import {
  mcpOAuthScopeMatrixRows,
  mcpOAuthScopeOperations,
  sortMcpOAuthScopes,
  type McpOAuthGrantedScope,
  type McpOAuthScopeMatrixRow,
  type McpOAuthScopeSummary,
} from "../../query"

type ScopeTableMeta = {
  canChange: boolean
  requestedSet: ReadonlySet<string>
  selectedSet: ReadonlySet<string>
  toggleScope: (scope: McpOAuthGrantedScope, checked: boolean) => void
  updateScopes: (
    scopes: readonly McpOAuthGrantedScope[],
    checked: boolean
  ) => void
}

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

const isScopeTableMeta = (value: unknown): value is ScopeTableMeta =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "canChange") === "boolean" &&
  typeof Reflect.get(value, "toggleScope") === "function" &&
  typeof Reflect.get(value, "updateScopes") === "function"

const getScopeTableMeta = (table: Table<McpOAuthScopeMatrixRow>) => {
  const meta = table.options.meta
  if (!isScopeTableMeta(meta)) {
    throw new Error("MCP OAuth scope table metadata is required")
  }
  return meta
}

const getScopeOperation = (id: string) =>
  mcpOAuthScopeOperations.find((operation) => operation.id === id)

const scopeCellCheckboxClassName =
  "mx-auto size-5 border-2 border-foreground/35 bg-background shadow-xs disabled:opacity-60"

const ScopeTargetCell = ({
  row,
  table,
}: CellContext<McpOAuthScopeMatrixRow, unknown>) => {
  const meta = getScopeTableMeta(table)
  const scopes = getRequestedRowScopes(row.original, meta.requestedSet)
  const state = getGroupState(scopes, meta.selectedSet)
  return (
    <ScopeGroupCheckbox
      displayLabel={row.original.label}
      label={`Toggle all ${row.original.label} access`}
      scopes={scopes}
      checked={state.checked}
      disabled={!meta.canChange || scopes.length === 0}
      indeterminate={state.indeterminate}
      updateScopes={meta.updateScopes}
    />
  )
}

const ScopeOperationHeader = ({
  column,
  table,
}: HeaderContext<McpOAuthScopeMatrixRow, unknown>) => {
  const operation = getScopeOperation(column.id)
  if (!operation) return null
  const meta = getScopeTableMeta(table)
  const scopes = mcpOAuthScopeMatrixRows.flatMap((row) => {
    const scope = row.scopes[operation.id]
    return scope && meta.requestedSet.has(scope) ? [scope] : []
  })
  const state = getGroupState(scopes, meta.selectedSet)
  return (
    <ScopeGroupCheckbox
      displayLabel={operation.label}
      label={`Toggle all ${operation.label} access`}
      scopes={scopes}
      checked={state.checked}
      disabled={!meta.canChange || scopes.length === 0}
      indeterminate={state.indeterminate}
      stacked
      updateScopes={meta.updateScopes}
    />
  )
}

const ScopeOperationCell = ({
  column,
  row,
  table,
}: CellContext<McpOAuthScopeMatrixRow, unknown>) => {
  const operation = getScopeOperation(column.id)
  if (!operation) return null
  const meta = getScopeTableMeta(table)
  const scope = row.original.scopes[operation.id]
  const requested = scope !== undefined && meta.requestedSet.has(scope)
  return requested && scope ? (
    <ScopeCellCheckbox
      label={`${row.original.label} ${operation.label} access`}
      scope={scope}
      checked={meta.selectedSet.has(scope)}
      disabled={!meta.canChange}
      toggleScope={meta.toggleScope}
    />
  ) : (
    <span aria-hidden="true" className="text-muted-foreground">
      —
    </span>
  )
}

const scopeOperationColumn = (
  operation: (typeof mcpOAuthScopeOperations)[number]
): ColumnDef<McpOAuthScopeMatrixRow> => ({
  id: operation.id,
  meta: {
    headerClassName: "w-13 p-1 pr-1! text-center",
    cellClassName: "w-13 p-1 pr-1! text-center",
  },
  header: ScopeOperationHeader,
  cell: ScopeOperationCell,
})

const createScopeColumns = (): ColumnDef<McpOAuthScopeMatrixRow>[] => [
  {
    id: "target",
    header: "Target",
    meta: {
      headerClassName: "w-28 p-2 pr-2!",
      cellClassName: "w-28 p-2 pr-2!",
    },
    cell: ScopeTargetCell,
  },
  ...mcpOAuthScopeOperations.map(scopeOperationColumn),
]

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
  const meta = useMemo<ScopeTableMeta>(
    () => ({
      canChange,
      requestedSet,
      selectedSet,
      toggleScope,
      updateScopes,
    }),
    [canChange, requestedSet, selectedSet, toggleScope, updateScopes]
  )
  const data = useMemo(() => [...mcpOAuthScopeMatrixRows], [])
  const columns = useMemo(createScopeColumns, [])
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    meta,
  })

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
      <DataTableRoot
        tableClassName="w-auto min-w-93 table-fixed"
        scrollLabel="Requested access"
      >
        <TableCaption className="sr-only">Requested access</TableCaption>
        <DataTableHeader table={table} />
        <DataTableBody table={table} />
      </DataTableRoot>

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
