"use client"

import { TableCaption } from "@enterprise-agentic-saas/ui/components/table"
import {
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
} from "@tanstack/react-table"
import { useMemo, type ReactNode } from "react"

import {
  DataTableBody,
  DataTableHeader,
  DataTableRoot,
} from "@/components/data-table/data-table"

import type { OrganizationSummary } from "../../schema"
import { OrganizationIdentity } from "../organization-identity/organization-identity"
import { OrganizationRoleBadge } from "../organization-role-badge/organization-role-badge"

type OrganizationsTableMeta = {
  renderOrganizationActions: (organization: OrganizationSummary) => ReactNode
}

const getOrganizationRowId = (organization: OrganizationSummary) =>
  organization.id

const isOrganizationsTableMeta = (
  value: unknown
): value is OrganizationsTableMeta =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "renderOrganizationActions") === "function"

const OrganizationIdentityCell = ({
  row,
}: CellContext<OrganizationSummary, unknown>) => (
  <OrganizationIdentity organization={row.original} />
)

const CompactOrganizationIdentityCell = ({
  row,
}: CellContext<OrganizationSummary, unknown>) => (
  <OrganizationIdentity
    organization={row.original}
    className="min-w-0"
    showRole
  />
)

const OrganizationSlugCell = ({
  row,
}: CellContext<OrganizationSummary, unknown>) => (
  <span className="font-mono text-xs text-muted-foreground">
    {row.original.slug}
  </span>
)

const OrganizationMembersCell = ({
  row,
}: CellContext<OrganizationSummary, unknown>) => `${row.original.memberCount}`

const OrganizationRoleCell = ({
  row,
}: CellContext<OrganizationSummary, unknown>) => (
  <OrganizationRoleBadge role={row.original.role} />
)

const OrganizationActionsCell = (
  context: CellContext<OrganizationSummary, unknown>
) => {
  const meta = context.table.options.meta
  return isOrganizationsTableMeta(meta)
    ? meta.renderOrganizationActions(context.row.original)
    : null
}

const organizationColumns: ColumnDef<OrganizationSummary>[] = [
  {
    accessorKey: "name",
    header: "Organization",
    cell: OrganizationIdentityCell,
  },
  {
    accessorKey: "slug",
    header: "Slug",
    meta: {
      headerClassName: "min-w-44",
      cellClassName: "min-w-44",
    },
    cell: OrganizationSlugCell,
  },
  {
    accessorKey: "memberCount",
    header: "Members",
    meta: {
      headerClassName: "min-w-24",
      cellClassName: "min-w-24",
    },
    cell: OrganizationMembersCell,
  },
  {
    accessorKey: "role",
    header: "Your role",
    meta: {
      headerClassName: "min-w-32",
      cellClassName: "min-w-32",
    },
    cell: OrganizationRoleCell,
  },
  {
    id: "actions",
    header: "Actions",
    meta: {
      headerClassName: "w-px",
      cellClassName: "w-px",
    },
    cell: OrganizationActionsCell,
  },
]

const compactOrganizationColumns: ColumnDef<OrganizationSummary>[] = [
  {
    accessorKey: "name",
    header: "Organization",
    meta: {
      headerClassName: "min-w-0",
      cellClassName: "min-w-0",
    },
    cell: CompactOrganizationIdentityCell,
  },
  {
    id: "actions",
    header: "Actions",
    meta: {
      headerClassName: "w-24 px-2 text-right",
      cellClassName: "w-24 px-2",
    },
    cell: OrganizationActionsCell,
  },
]

export const OrganizationsTable = ({
  caption,
  compact = false,
  organizations,
  renderActions,
}: {
  caption: string
  compact?: boolean
  organizations: readonly OrganizationSummary[]
  renderActions: (organization: OrganizationSummary) => ReactNode
}) => {
  const data = useMemo(() => [...organizations], [organizations])
  const meta = useMemo(
    () => ({ renderOrganizationActions: renderActions }),
    [renderActions]
  )
  const table = useReactTable({
    data,
    columns: compact ? compactOrganizationColumns : organizationColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getOrganizationRowId,
    meta,
  })

  return (
    <DataTableRoot
      className="rounded-2xl"
      tableClassName={compact ? "w-auto min-w-72 table-fixed" : "min-w-208"}
      scrollLabel={caption}
    >
      <TableCaption className="sr-only">{caption}</TableCaption>
      <DataTableHeader table={table} />
      <DataTableBody table={table} />
    </DataTableRoot>
  )
}
