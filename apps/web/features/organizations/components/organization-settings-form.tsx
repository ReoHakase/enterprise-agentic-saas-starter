"use client"

import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  FieldError,
  FieldGroup,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { type AnyFieldApi, useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Building2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useCallback, useState } from "react"
import { toast } from "sonner"

import { FormTextField } from "@/components/form-text-field"
import { consoleKeys } from "@/features/console/queries"
import { OrganizationDangerZone } from "@/features/organizations/components/organization-danger-zone"
import {
  organizationFormSchema,
  roleLabel,
  type OrganizationDetail,
} from "@/features/organizations/schema"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { ConsoleApiError } from "@/lib/console-api"

export const OrganizationSettingsForm = ({
  organization,
}: {
  organization: OrganizationDetail
}) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const updateMutation = useMutation({
    mutationFn: (value: { name: string; slug: string }) =>
      browserConsoleApi.updateOrganization(organization.id, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organization(organization.id),
      })
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organizations(),
      })
      router.refresh()
      toast.success("Organization updated")
    },
  })
  const form = useForm({
    defaultValues: {
      name: organization.name,
      slug: organization.slug,
    },
    validators: { onSubmit: organizationFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      setFieldErrors({})
      try {
        const updated = await updateMutation.mutateAsync(value)
        form.reset({ name: updated.name, slug: updated.slug })
      } catch (error) {
        setFieldErrors(
          error instanceof ConsoleApiError ? error.fieldErrors : {}
        )
        setSubmitError(
          error instanceof Error
            ? error.message
            : "The organization could not be updated."
        )
      }
    },
  })
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const renderNameField = useCallback(
    (field: AnyFieldApi) => (
      <FormTextField
        field={field}
        id="organization-name"
        label="Name"
        serverErrors={fieldErrors.name}
        orientation="responsive"
        autoComplete="organization"
      />
    ),
    [fieldErrors.name]
  )
  const renderSlugField = useCallback(
    (field: AnyFieldApi) => (
      <FormTextField
        field={field}
        id="organization-slug"
        label="Slug"
        description="Lowercase letters, numbers, and single hyphens only."
        serverErrors={fieldErrors.slug}
        orientation="responsive"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
    ),
    [fieldErrors.slug]
  )
  const selectSubmitState = useCallback(
    (state: typeof form.state) => ({
      canSubmit: state.canSubmit,
      isDirty: state.isDirty,
      isSubmitting: state.isSubmitting,
    }),
    []
  )
  const renderSubmitButton = useCallback(
    ({
      canSubmit,
      isDirty,
      isSubmitting,
    }: ReturnType<typeof selectSubmitState>) => (
      <Button type="submit" disabled={!canSubmit || !isDirty || isSubmitting}>
        {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Save changes
      </Button>
    ),
    []
  )

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <section
        className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:p-5"
        aria-labelledby="organization-identity-heading"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Building2Icon aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="organization-identity-heading"
            className="truncate font-medium"
          >
            {organization.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {organization.slug} · {organization.memberCount} members
          </p>
        </div>
        <Badge variant="secondary">{roleLabel(organization.role)}</Badge>
      </section>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div>
          <h2 className="font-medium">General</h2>
          <p className="text-sm text-muted-foreground">
            Update the name people see and the stable slug used by integrations.
          </p>
        </div>
        <FieldGroup className="max-w-2xl">
          <form.Field name="name">{renderNameField}</form.Field>
          <form.Field name="slug">{renderSlugField}</form.Field>
          {submitError ? (
            <FieldError role="alert">{submitError}</FieldError>
          ) : null}
        </FieldGroup>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4">
          <Button
            nativeButton={false}
            variant="ghost"
            render={<Link href="/settings/organizations" />}
          >
            Back to organizations
          </Button>
          <form.Subscribe selector={selectSubmitState}>
            {renderSubmitButton}
          </form.Subscribe>
        </div>
      </form>

      <OrganizationDangerZone organization={organization} />
    </div>
  )
}
