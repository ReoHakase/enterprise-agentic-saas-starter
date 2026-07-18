"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
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
import { useForm } from "@tanstack/react-form"
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
  PlusIcon,
  SettingsIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"

import { LinkButton } from "@/components/link-button"
import { PageShell } from "@/components/page-shell"
import { UserAvatar } from "@/components/user-identity"
import { showConsoleApiErrorToast } from "@/features/console/error-toast"
import {
  consoleKeys,
  organizationsQueryOptions,
} from "@/features/console/queries"
import {
  cancelTenantWorkForOrganizationSwitch,
  prepareOrganizationSwitch,
} from "@/features/organizations/cache"
import {
  organizationFormSchema,
  roleLabel,
  toOrganizationSlug,
  type OrganizationSummary,
} from "@/features/organizations/schema"
import { browserConsoleApi } from "@/lib/browser/console-api"
import {
  clearConsoleApiFieldError,
  getConsoleApiErrorText,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/lib/console-api"

const organizationCreateFields = ["name", "slug"] as const
const organizationCreateTrigger = <Button />
const getOrganizationRowId = (organization: OrganizationSummary) =>
  organization.id

const selectCreateSubmitState = (state: {
  canSubmit: boolean
  isSubmitting: boolean
}) => ({
  canSubmit: state.canSubmit,
  isSubmitting: state.isSubmitting,
})

export const OrganizationsPage = ({
  initialOrganizations,
}: {
  initialOrganizations: OrganizationSummary[]
}) => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const organizationsQuery = useQuery({
    ...organizationsQueryOptions(),
    initialData: initialOrganizations,
  })
  const activateMutation = useMutation({
    mutationFn: async (input: {
      organizationId: string
      redirectTo?: string
    }) => {
      await cancelTenantWorkForOrganizationSwitch(queryClient)
      return browserConsoleApi.activateOrganization(input.organizationId)
    },
    onSuccess: async (_, input) => {
      await prepareOrganizationSwitch(queryClient, input.organizationId)
      if (input.redirectTo) {
        router.push(input.redirectTo)
      }
      router.refresh()
      toast.success("Organization switched")
    },
    onError: (error) => {
      showConsoleApiErrorToast(error, "Could not switch organization")
    },
  })
  const { isPending: activatePending, mutate: activateOrganization } =
    activateMutation
  const activate = useCallback(
    (organizationId: string, redirectTo?: string) =>
      activateOrganization({ organizationId, redirectTo }),
    [activateOrganization]
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
        cell: ({ row }) => (
          <Badge variant="secondary">{roleLabel(row.original.role)}</Badge>
        ),
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
          <Table scrollLabel="Organizations attached to your account">
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
  )
}

const OrganizationCreateAction = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [slugEdited, setSlugEdited] = useState(false)
  const createMutation = useMutation({
    mutationFn: (input: { name: string; slug: string }) =>
      browserConsoleApi.createOrganization(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organizations(),
      })
      setOpen(false)
      router.refresh()
      toast.success("Organization created")
    },
  })
  const form = useForm({
    defaultValues: { name: "", slug: "" },
    validators: { onSubmit: organizationFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      setFieldErrors({})
      try {
        await createMutation.mutateAsync(value)
        form.reset()
        setSlugEdited(false)
      } catch (error) {
        const nextFieldErrors = getConsoleApiFieldErrors(error)
        setFieldErrors(nextFieldErrors)
        setSubmitError(
          hasConsoleApiFieldError(nextFieldErrors, organizationCreateFields)
            ? undefined
            : getConsoleApiErrorText(
                error,
                "The organization could not be created."
              )
        )
      }
    },
  })
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen && !form.state.isSubmitting) {
        form.reset()
        setSlugEdited(false)
        setSubmitError(undefined)
        setFieldErrors({})
      }
    },
    [form]
  )
  const closeDialog = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  )
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const syncSlugFromName = useCallback(
    (name: string) => {
      if (!slugEdited) {
        form.setFieldValue("slug", toOrganizationSlug(name))
      }
    },
    [form, slugEdited]
  )
  const editOrganizationName = useCallback(() => {
    setFieldErrors((current) => {
      const withoutName = clearConsoleApiFieldError(current, "name")
      return slugEdited
        ? withoutName
        : clearConsoleApiFieldError(withoutName, "slug")
    })
    setSubmitError(undefined)
  }, [slugEdited])
  const editOrganizationSlug = useCallback(() => {
    setSlugEdited(true)
    setFieldErrors((current) => clearConsoleApiFieldError(current, "slug"))
    setSubmitError(undefined)
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={organizationCreateTrigger}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        Create organization
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Create an isolated workspace for members, permissions, and issues.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <form.Field name="name">
              {(field) => {
                const locallyInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                const invalid =
                  locallyInvalid || Boolean(fieldErrors.name?.length)
                const localErrorId = locallyInvalid
                  ? "organization-create-name-local-error"
                  : undefined
                const serverErrorId = fieldErrors.name?.length
                  ? "organization-create-name-server-error"
                  : undefined
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <OrganizationNameInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onValueChange={field.handleChange}
                      onNameChange={syncSlugFromName}
                      onEdit={editOrganizationName}
                      aria-describedby={
                        [localErrorId, serverErrorId]
                          .filter((value): value is string => Boolean(value))
                          .join(" ") || undefined
                      }
                      aria-invalid={invalid}
                    />
                    {locallyInvalid ? (
                      <FieldError
                        id={localErrorId}
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                    {fieldErrors.name ? (
                      <FieldError id={serverErrorId} role="alert">
                        {fieldErrors.name.join(" ")}
                      </FieldError>
                    ) : null}
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="slug">
              {(field) => {
                const locallyInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid
                const invalid =
                  locallyInvalid || Boolean(fieldErrors.slug?.length)
                const descriptionId = "organization-create-slug-description"
                const localErrorId = locallyInvalid
                  ? "organization-create-slug-local-error"
                  : undefined
                const serverErrorId = fieldErrors.slug?.length
                  ? "organization-create-slug-server-error"
                  : undefined
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
                    <OrganizationSlugInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onValueChange={field.handleChange}
                      onEdit={editOrganizationSlug}
                      aria-describedby={[
                        descriptionId,
                        localErrorId,
                        serverErrorId,
                      ]
                        .filter((value): value is string => Boolean(value))
                        .join(" ")}
                      aria-invalid={invalid}
                    />
                    <FieldDescription id={descriptionId}>
                      Used in URLs and API references. Lowercase letters,
                      numbers, and hyphens only.
                    </FieldDescription>
                    {locallyInvalid ? (
                      <FieldError
                        id={localErrorId}
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                    {fieldErrors.slug ? (
                      <FieldError id={serverErrorId} role="alert">
                        {fieldErrors.slug.join(" ")}
                      </FieldError>
                    ) : null}
                  </Field>
                )
              }}
            </form.Field>
            {submitError ? (
              <FieldError role="alert">{submitError}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <form.Subscribe selector={selectCreateSubmitState}>
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  Create organization
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
      <Building2Icon aria-hidden="true" />
    </span>
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
        {organization.memberAvatars.slice(0, 3).map((member) => (
          <UserAvatar
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

const OrganizationNameInput = ({
  onEdit,
  onNameChange,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "autoComplete" | "onChange"> & {
  onEdit: () => void
  onNameChange: (name: string) => void
  onValueChange: (value: string) => void
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const name = event.target.value
      onEdit()
      onValueChange(name)
      onNameChange(name)
    },
    [onEdit, onNameChange, onValueChange]
  )

  return (
    <Input {...props} autoComplete="organization" onChange={handleChange} />
  )
}

const OrganizationSlugInput = ({
  onEdit,
  onValueChange,
  ...props
}: Omit<
  React.ComponentProps<typeof Input>,
  "autoCapitalize" | "autoComplete" | "onChange" | "spellCheck"
> & {
  onEdit: () => void
  onValueChange: (value: string) => void
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      onValueChange(event.target.value)
    },
    [onEdit, onValueChange]
  )

  return (
    <Input
      {...props}
      autoCapitalize="none"
      autoComplete="off"
      spellCheck={false}
      onChange={handleChange}
    />
  )
}

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
