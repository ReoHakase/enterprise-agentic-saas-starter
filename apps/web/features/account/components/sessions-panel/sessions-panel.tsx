"use client"

import {
  AlertDialog,
  AlertDialogAction,
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
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
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
  type CellContext,
  type ColumnDef,
} from "@tanstack/react-table"
import { LaptopIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date/local-date"
import {
  showConsoleApiErrorToast,
  consoleKeys,
  sessionsQueryOptions,
} from "@/features/console"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { getConsoleApiErrorText } from "@/lib/console-api"

import type { UserSession } from "../../schema"
import { describeSessionClient } from "../../user-agent"

export const SessionsPanel = () => {
  const queryClient = useQueryClient()
  const sessionsQuery = useQuery(sessionsQueryOptions())
  const [revokeTarget, setRevokeTarget] = useState<
    UserSession | "others" | undefined
  >()
  const revokeMutation = useMutation<unknown, Error, UserSession | "others">({
    mutationFn: (target: UserSession | "others") =>
      target === "others"
        ? browserConsoleApi.revokeOtherSessions()
        : browserConsoleApi.revokeSession(target.id),
    onSuccess: async (_, target) => {
      setRevokeTarget(undefined)
      await queryClient.invalidateQueries({ queryKey: consoleKeys.sessions() })
      toast.success(
        target === "others" ? "Other sessions revoked" : "Session revoked"
      )
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "The session was not revoked.")
    },
  })
  const { isPending: revokePending, mutate: revoke } = revokeMutation
  const { refetch: refetchSessions } = sessionsQuery
  const requestOtherSessionRevocation = useCallback(
    () => setRevokeTarget("others"),
    []
  )
  const retrySessions = useCallback(() => {
    void refetchSessions()
  }, [refetchSessions])
  const handleDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setRevokeTarget(undefined)
    }
  }, [])
  const confirmRevocation = useCallback(() => {
    if (revokeTarget) {
      revoke(revokeTarget)
    }
  }, [revoke, revokeTarget])

  return (
    <section
      className="flex w-full max-w-full min-w-0 flex-col gap-5 overflow-hidden rounded-2xl border p-4 sm:p-5"
      aria-labelledby="sessions-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="sessions-heading" className="font-medium">
            Signed-in devices
          </h2>
          <p className="text-sm text-muted-foreground">
            Revoke sessions you no longer recognize. Your current session stays
            available.
          </p>
        </div>
        <Button
          className="w-full shrink-0 sm:w-auto"
          variant="outline"
          disabled={
            sessionsQuery.isPending ||
            revokePending ||
            !sessionsQuery.data?.some((session) => !session.current)
          }
          onClick={requestOtherSessionRevocation}
        >
          Revoke other sessions
        </Button>
      </div>

      {sessionsQuery.isPending ? <SessionsSkeleton /> : null}
      {sessionsQuery.isError ? (
        <Empty className="border" role="alert">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Sessions could not be loaded</EmptyTitle>
            <EmptyDescription>
              {getConsoleApiErrorText(
                sessionsQuery.error,
                "Try the request again."
              )}
            </EmptyDescription>
            <Button variant="outline" onClick={retrySessions}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessionsQuery.data?.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LaptopIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No active sessions</EmptyTitle>
            <EmptyDescription>
              Active browser sessions will appear here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {sessionsQuery.data && sessionsQuery.data.length > 0 ? (
        <SessionsTable
          sessions={sessionsQuery.data}
          pending={revokePending}
          onRevoke={setRevokeTarget}
        />
      ) : null}

      <AlertDialog
        open={revokeTarget !== undefined}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revokeTarget === "others"
                ? "Revoke every other session?"
                : "Revoke this session?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget === "others"
                ? "Every other device will need to sign in again."
                : "This device will need to sign in again. This cannot be undone from the current page."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokePending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokePending || revokeTarget === undefined}
              onClick={confirmRevocation}
            >
              {revokePending ? <Spinner data-icon="inline-start" /> : null}
              Revoke session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

const SessionsTable = ({
  sessions,
  pending,
  onRevoke,
}: {
  sessions: UserSession[]
  pending: boolean
  onRevoke: (session: UserSession) => void
}) => {
  const contextValue = useMemo(
    () => ({ onRevoke, pending }),
    [onRevoke, pending]
  )
  const table = useReactTable({
    data: sessions,
    columns: sessionColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getSessionRowId,
  })

  return (
    <SessionTableContext.Provider value={contextValue}>
      <div className="max-w-full min-w-0 overflow-hidden rounded-xl border">
        <Table className="min-w-264" scrollLabel="Signed-in device sessions">
          <TableCaption className="sr-only">
            Signed-in device sessions
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={sessionColumnClass(header.column.id)}
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
                    className={sessionColumnClass(cell.column.id)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SessionTableContext.Provider>
  )
}

type SessionCell = CellContext<UserSession, unknown>
type SessionTableContextValue = {
  pending: boolean
  onRevoke: (session: UserSession) => void
}

const SessionTableContext = createContext<SessionTableContextValue | null>(null)
const getSessionRowId = (session: UserSession) => session.id
const SessionActionsHeader = () => <span className="sr-only">Actions</span>

const SessionDeviceCell = ({ row }: SessionCell) => {
  const client = describeSessionClient(row.original.userAgent)
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <LaptopIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{client.device}</span>
          {row.original.current ? (
            <Badge variant="secondary">Current</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {client.operatingSystem} · {client.platform}
        </p>
      </div>
    </div>
  )
}

const SessionBrowserCell = ({ row }: SessionCell) => {
  const client = describeSessionClient(row.original.userAgent)
  return (
    <div>
      <p className="font-medium">{client.browser}</p>
      <p className="text-xs text-muted-foreground">{client.engine} engine</p>
    </div>
  )
}

const SessionUserAgentCell = ({ row }: SessionCell) => (
  <p className="max-w-80 font-mono text-xs break-all whitespace-normal text-muted-foreground">
    {describeSessionClient(row.original.userAgent).userAgent}
  </p>
)

const SessionUpdatedAtCell = ({ row }: SessionCell) => (
  <LocalDate includeTime value={row.original.updatedAt} />
)

const SessionExpiresAtCell = ({ row }: SessionCell) => (
  <LocalDate includeTime value={row.original.expiresAt} />
)

const SessionActionsCell = ({ row }: SessionCell) => {
  const context = useContext(SessionTableContext)
  const requestRevocation = useCallback(() => {
    context?.onRevoke(row.original)
  }, [context, row.original])

  if (row.original.current) return null

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={context?.pending}
      onClick={requestRevocation}
    >
      Revoke
    </Button>
  )
}

const sessionColumns: ColumnDef<UserSession>[] = [
  { id: "device", header: "Device", cell: SessionDeviceCell },
  { id: "browser", header: "Browser", cell: SessionBrowserCell },
  { id: "userAgent", header: "User-Agent", cell: SessionUserAgentCell },
  {
    accessorKey: "updatedAt",
    header: "Updated at",
    cell: SessionUpdatedAtCell,
  },
  {
    accessorKey: "expiresAt",
    header: "Expires at",
    cell: SessionExpiresAtCell,
  },
  { id: "actions", header: SessionActionsHeader, cell: SessionActionsCell },
]

const sessionColumnClass = (columnId: string) => {
  if (columnId === "device") return "w-56 min-w-56"
  if (columnId === "browser") return "w-52 min-w-52"
  if (columnId === "userAgent") return "w-80 min-w-80"
  if (columnId === "updatedAt" || columnId === "expiresAt") {
    return "w-44 min-w-44"
  }
  if (columnId === "actions") return "w-24 min-w-24 text-right"
  return undefined
}

const SessionsSkeleton = () => (
  <div
    className="flex flex-col gap-2"
    role="status"
    aria-label="Loading sessions"
  >
    <Skeleton className="h-20 w-full rounded-xl" />
    <Skeleton className="h-20 w-full rounded-xl" />
  </div>
)
