"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table"
import {
  Building2Icon,
  CheckIcon,
  SettingsIcon,
  UsersRoundIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { LinkButton } from "@/components/link-button/link-button"
import { PageShell } from "@/components/page-shell/page-shell"
import { UserProfileImage } from "@/components/user-identity/user-identity"
import {
  hasOrganizationSwitchRisks,
  useAgentRuntimeState,
  type OrganizationSwitchRisks,
} from "@/features/agent"
import {
  getConsoleApiErrorText,
  showConsoleApiErrorToast,
  organizationsQueryOptions,
} from "@/features/console"
import { browserConsoleApi } from "@/lib/browser/console-api"

import { prepareOrganizationSwitch } from "../../cache"
import { navigateAfterOrganizationSwitch } from "../../organization-switch-flash"
import type { OrganizationSummary } from "../../schema"
import { organizationCreateAction as OrganizationCreateAction } from "../organization-create-action/organization-create-action"
import { OrganizationProfileImage } from "../organization-identity/organization-identity"
import { OrganizationRoleBadge } from "../organization-role-badge/organization-role-badge"

const getOrganizationRowId = (organization: OrganizationSummary) =>
  organization.id

export const OrganizationsPage = ({
  initialOrganizations,
}: {
  initialOrganizations: OrganizationSummary[]
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const agentRuntime = useAgentRuntimeState()
  const [pendingOrganizationSwitch, setPendingOrganizationSwitch] = useState<{
    organizationId: string
    redirectTo?: string
    risks: OrganizationSwitchRisks
  }>()
  const organizationsQuery = useQuery({
    ...organizationsQueryOptions(),
    initialData: initialOrganizations,
  })
  const activateMutation = useMutation({
    mutationFn: (input: { organizationId: string; redirectTo?: string }) =>
      browserConsoleApi.activateOrganization(input.organizationId),
    onSuccess: async (_, input) => {
      await agentRuntime.completeOrganizationSwitch()
      await prepareOrganizationSwitch(queryClient, input.organizationId)
      if (input.redirectTo) {
        // A client transition retains the shared ConsoleShell and can keep the
        // previous tenant's `me` and Agent props. Crossing tenant routes must
        // discard the complete React/RSC tree.
        navigateAfterOrganizationSwitch(
          globalThis.sessionStorage,
          globalThis.location,
          input.redirectTo
        )
        return
      }
      // Active organization changed, so every tenant-scoped query value,
      // including agentThread, must be discarded before the refresh.
      router.replace(pathname)
      router.refresh()
      toast.success("Organization switched")
    },
    onError: (error) => {
      agentRuntime.cancelOrganizationSwitch()
      showConsoleApiErrorToast(error, "Could not switch organization")
    },
  })
  const { isPending: activatePending, mutate: activateOrganization } =
    activateMutation
  const activate = useCallback(
    (organizationId: string, redirectTo?: string) => {
      const risks = agentRuntime.beginOrganizationSwitch()
      if (hasOrganizationSwitchRisks(risks)) {
        setPendingOrganizationSwitch({ organizationId, redirectTo, risks })
        return
      }
      activateOrganization({ organizationId, redirectTo })
    },
    [activateOrganization, agentRuntime]
  )
  const cancelPendingOrganizationSwitch = useCallback(() => {
    setPendingOrganizationSwitch(undefined)
    agentRuntime.cancelOrganizationSwitch()
  }, [agentRuntime])
  const confirmPendingOrganizationSwitch = useCallback(() => {
    const pendingSwitch = pendingOrganizationSwitch
    setPendingOrganizationSwitch(undefined)
    if (pendingSwitch) {
      activateOrganization({
        organizationId: pendingSwitch.organizationId,
        redirectTo: pendingSwitch.redirectTo,
      })
    }
  }, [activateOrganization, pendingOrganizationSwitch])
  const handleSwitchDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelPendingOrganizationSwitch()
    },
    [cancelPendingOrganizationSwitch]
  )
  const columns = useMemo<ColumnDef<OrganizationSummary>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Organization",
        cell: ({ row }) => <OrganizationIdentity organization={row.original} />,
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.slug}
          </span>
        ),
      },
      {
        accessorKey: "memberCount",
        header: "Members",
        cell: ({ row }) => `${row.original.memberCount}`,
      },
      {
        accessorKey: "role",
        header: "Your role",
        cell: ({ row }) => <OrganizationRoleBadge role={row.original.role} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <OrganizationActions
            organization={row.original}
            pending={activatePending}
            onActivate={activate}
          />
        ),
      },
    ],
    [activate, activatePending]
  )
  const table = useReactTable({
    data: organizationsQuery.data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getOrganizationRowId,
  })
  return (
    <>
      <PageShell
        title="Organizations"
        description="Choose the tenant context for this session or create a new workspace."
        action={OrganizationCreateAction}
      >
        {organizationsQuery.isError ? (
          <Empty className="border" role="alert">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Organizations could not be loaded</EmptyTitle>
              <EmptyDescription>
                {getConsoleApiErrorText(
                  organizationsQuery.error,
                  "Try the request again."
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : organizationsQuery.data.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Create your first organization</EmptyTitle>
              <EmptyDescription>
                Organizations isolate members, permissions, and issue data. Use
                the create action above to continue to the dashboard.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-2xl border">
            <Table
              className="min-w-208"
              scrollLabel="Organizations attached to your account"
            >
              <TableCaption className="sr-only">
                Organizations attached to your account
              </TableCaption>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={organizationColumnClass(header.column.id)}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={organizationColumnClass(cell.column.id)}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageShell>
      <AlertDialog
        open={pendingOrganizationSwitch !== undefined}
        onOpenChange={handleSwitchDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard local Agent work and switch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Unsent messages, uploads, approvals, and unsaved Issue form fields
              will be cleared only after the organization switch succeeds.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelPendingOrganizationSwitch}>
              Stay here
            </AlertDialogCancel>
            <Button onClick={confirmPendingOrganizationSwitch}>
              Discard local draft and switch
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const organizationColumnClass = (columnId: string) => {
  if (columnId === "slug") return "min-w-44"
  if (columnId === "memberCount") return "min-w-24"
  if (columnId === "role") return "min-w-32"
  return undefined
}

const OrganizationIdentity = ({
  organization,
}: {
  organization: OrganizationSummary
}) => (
  <div className="flex min-w-52 items-center gap-3">
    <OrganizationProfileImage organization={organization} className="size-10" />
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="truncate font-medium">{organization.name}</p>
        {organization.active ? (
          <Badge variant="outline">
            <CheckIcon aria-hidden="true" /> Active
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {organization.memberProfileImages.slice(0, 3).map((member) => (
          <UserProfileImage
            key={member.userId}
            user={member}
            className="size-6 border-2 border-background"
          />
        ))}
        <span className="text-xs text-muted-foreground sm:hidden">
          {organization.memberCount} members
        </span>
      </div>
    </div>
  </div>
)

const OrganizationActions = ({
  organization,
  pending,
  onActivate,
}: {
  organization: OrganizationSummary
  pending: boolean
  onActivate: (organizationId: string, redirectTo?: string) => void
}) => {
  const membersHref = `/organization/${organization.slug}/members`
  const settingsHref = `/organization/${organization.slug}/settings`
  const activateOrganization = useCallback(
    () => onActivate(organization.id),
    [onActivate, organization.id]
  )
  const openMembers = useCallback(
    () => onActivate(organization.id, membersHref),
    [membersHref, onActivate, organization.id]
  )
  const openSettings = useCallback(
    () => onActivate(organization.id, settingsHref),
    [onActivate, organization.id, settingsHref]
  )

  return (
    <div className="flex justify-end gap-1">
      <Button
        variant={organization.active ? "secondary" : "outline"}
        size="sm"
        disabled={pending || organization.active}
        onClick={activateOrganization}
      >
        {pending && !organization.active ? (
          <Spinner data-icon="inline-start" />
        ) : null}
        {organization.active ? "Active" : "Switch"}
      </Button>
      {organization.active ? (
        <LinkButton
          variant="ghost"
          size="icon-sm"
          aria-label={`Members for ${organization.name}`}
          href={membersHref}
        >
          <UsersRoundIcon aria-hidden="true" />
        </LinkButton>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Switch to ${organization.name} and open members`}
          disabled={pending}
          onClick={openMembers}
        >
          {pending ? <Spinner /> : <UsersRoundIcon aria-hidden="true" />}
        </Button>
      )}
      {organization.permissions.canEditOrganization ? (
        organization.active ? (
          <LinkButton
            variant="ghost"
            size="icon-sm"
            aria-label={`Settings for ${organization.name}`}
            href={settingsHref}
          >
            <SettingsIcon aria-hidden="true" />
          </LinkButton>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Switch to ${organization.name} and open settings`}
            disabled={pending}
            onClick={openSettings}
          >
            {pending ? <Spinner /> : <SettingsIcon aria-hidden="true" />}
          </Button>
        )
      ) : null}
    </div>
  )
}
