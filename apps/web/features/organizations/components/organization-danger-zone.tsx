"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  FieldError,
  FieldGroup,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { type AnyFieldApi, useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ShieldAlertIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { FormTextField } from "@/components/form-text-field"
import { consoleKeys } from "@/features/console/queries"
import {
  createOrganizationDeletionFormSchema,
  type OrganizationDetail,
} from "@/features/organizations/schema"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { ConsoleApiError, isStepUpRequiredError } from "@/lib/console-api"

const createDeletionIdempotencyKey = () =>
  `delete_org_${globalThis.crypto.randomUUID().replaceAll("-", "")}`

const getReauthenticationHref = (action = "organization.delete") => {
  const redirectTo = `${globalThis.location.pathname}${globalThis.location.search}`
  return `/auth/sign-in?reauth=1&action=${encodeURIComponent(action)}&redirectTo=${encodeURIComponent(redirectTo)}`
}

export const OrganizationDangerZone = ({
  organization,
}: {
  organization: OrganizationDetail
}) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [reauthenticationHref, setReauthenticationHref] = useState<string>()
  const [idempotencyKey, setIdempotencyKey] = useState(
    createDeletionIdempotencyKey
  )
  const deletionFormSchema = useMemo(
    () => createOrganizationDeletionFormSchema(organization.slug),
    [organization.slug]
  )
  const deleteMutation = useMutation({
    mutationFn: (input: {
      slug: string
      confirmation: "DELETE"
      idempotencyKey: string
    }) => browserConsoleApi.deleteOrganization(organization.id, input),
  })
  const form = useForm({
    defaultValues: { slug: "", confirmation: "" },
    validators: { onSubmit: deletionFormSchema },
    onSubmit: async ({ value }) => {
      if (value.confirmation !== "DELETE") {
        return
      }

      setSubmitError(undefined)
      setFieldErrors({})
      setReauthenticationHref(undefined)

      try {
        await deleteMutation.mutateAsync({
          slug: value.slug,
          confirmation: value.confirmation,
          idempotencyKey,
        })
        queryClient.removeQueries({
          queryKey: consoleKeys.organization(organization.id),
        })
        await queryClient.invalidateQueries({
          queryKey: consoleKeys.organizations(),
        })
        toast.success("Organization deleted")
        router.replace("/settings/organizations")
        router.refresh()
      } catch (error) {
        setFieldErrors(
          error instanceof ConsoleApiError ? error.fieldErrors : {}
        )
        if (isStepUpRequiredError(error)) {
          const action =
            typeof error.context.action === "string"
              ? error.context.action
              : undefined
          setSubmitError(
            "Sign in again before deleting this organization, then retry with the same confirmation."
          )
          setReauthenticationHref(getReauthenticationHref(action))
          return
        }

        const message =
          error instanceof Error
            ? error.message
            : "The organization could not be deleted."
        setSubmitError(message)
        toast.error(message)
      }
    },
  })

  const resetDialog = useCallback(() => {
    form.reset()
    setSubmitError(undefined)
    setFieldErrors({})
    setReauthenticationHref(undefined)
  }, [form])
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        setIdempotencyKey(createDeletionIdempotencyKey())
        resetDialog()
      } else if (!form.state.isSubmitting) {
        resetDialog()
      }
    },
    [form.state.isSubmitting, resetDialog]
  )
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const renderSlugField = useCallback(
    (field: AnyFieldApi) => (
      <FormTextField
        field={field}
        id="organization-delete-slug"
        label="Type the organization slug"
        serverErrors={fieldErrors.slug}
        description={
          <>
            Enter <strong>{organization.slug}</strong> exactly.
          </>
        }
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
    ),
    [fieldErrors.slug, organization.slug]
  )
  const renderConfirmationField = useCallback(
    (field: AnyFieldApi) => (
      <FormTextField
        field={field}
        id="organization-delete-confirmation"
        label="Type DELETE to confirm"
        serverErrors={fieldErrors.confirmation}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
      />
    ),
    [fieldErrors.confirmation]
  )
  const selectDeleteState = useCallback(
    (state: typeof form.state) => ({
      canSubmit: state.canSubmit,
      confirmation: state.values.confirmation,
      isSubmitting: state.isSubmitting,
      slug: state.values.slug,
    }),
    []
  )
  const renderDeleteButton = useCallback(
    ({
      canSubmit,
      confirmation,
      isSubmitting,
      slug,
    }: ReturnType<typeof selectDeleteState>) => (
      <Button
        type="submit"
        variant="destructive"
        disabled={
          !canSubmit ||
          isSubmitting ||
          slug !== organization.slug ||
          confirmation !== "DELETE"
        }
      >
        {isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
        )}
        Permanently delete
      </Button>
    ),
    [organization.slug]
  )

  if (organization.role !== "super_admin") {
    return (
      <section
        className="flex flex-col gap-3 border-t pt-6"
        aria-labelledby="danger-zone-heading"
      >
        <div className="flex items-start gap-3">
          <ShieldAlertIcon
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h2 id="danger-zone-heading" className="font-medium">
              Sensitive controls
            </h2>
            <p className="text-sm text-muted-foreground">
              Only the Super Admin can transfer ownership or permanently delete
              this organization.
            </p>
          </div>
        </div>
        <Button
          nativeButton={false}
          className="w-fit"
          variant="outline"
          render={<Link href={`/organization/${organization.id}/members`} />}
        >
          Review members and ownership
        </Button>
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-4 border-t border-destructive/30 pt-6"
      aria-labelledby="danger-zone-heading"
    >
      <div className="flex items-start gap-3">
        <ShieldAlertIcon
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 id="danger-zone-heading" className="font-medium">
            Danger zone
          </h2>
          <p className="text-sm text-muted-foreground">
            Deletion is immediate and irreversible. Members lose access at once;
            attachment cleanup continues safely in the background.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          nativeButton={false}
          className="w-fit"
          variant="outline"
          render={<Link href={`/organization/${organization.id}/members`} />}
        >
          Transfer ownership
        </Button>
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger
            render={<Button className="w-fit" variant="destructive" />}
          >
            <Trash2Icon data-icon="inline-start" aria-hidden="true" />
            Delete organization
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <Trash2Icon aria-hidden="true" />
              </AlertDialogMedia>
              <AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes organization data immediately. This
                action cannot be undone or restored.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              className="flex min-w-0 flex-col gap-5"
              onSubmit={handleSubmit}
            >
              <FieldGroup>
                <form.Field name="slug">{renderSlugField}</form.Field>
                <form.Field name="confirmation">
                  {renderConfirmationField}
                </form.Field>
                {submitError ? (
                  <FieldError role="alert">{submitError}</FieldError>
                ) : null}
                {reauthenticationHref ? (
                  <Button
                    nativeButton={false}
                    className="w-fit"
                    variant="outline"
                    render={<Link href={reauthenticationHref} />}
                  >
                    Sign in again
                  </Button>
                ) : null}
              </FieldGroup>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={form.state.isSubmitting}>
                  Cancel
                </AlertDialogCancel>
                <form.Subscribe selector={selectDeleteState}>
                  {renderDeleteButton}
                </form.Subscribe>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}
