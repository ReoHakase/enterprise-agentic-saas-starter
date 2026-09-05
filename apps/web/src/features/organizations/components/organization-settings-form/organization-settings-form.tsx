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
import { useRouter } from "@tanstack/react-router"
import { type FormEvent, useCallback, useState } from "react"
import { toast } from "sonner"

import { FormTextField } from "@/components/form-text-field/form-text-field"
import { LinkButton } from "@/components/link-button/link-button"
import {
  clearConsoleApiFieldError,
  consoleKeys,
  getConsoleApiErrorText,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/features/console"
import { ProfileImageEditor } from "@/features/profile-images"
import { browserConsoleApi } from "@/lib/browser/console-api"

import {
  organizationFormSchema,
  roleLabel,
  type OrganizationDetail,
} from "../../schema"
import { OrganizationDangerZone } from "../organization-danger-zone/organization-danger-zone"
import { OrganizationProfileImage } from "../organization-identity/organization-identity"

const organizationIdentityFields = ["name", "slug"] as const

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
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organization(organization.id),
      })
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organizations(),
      })
      if (updated.slug !== organization.slug) {
        void router.navigate({
          replace: true,
          to: `/organization/${updated.slug}/settings`,
        })
      } else {
        void router.invalidate()
      }
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
        const nextFieldErrors = getConsoleApiFieldErrors(error)
        setFieldErrors(nextFieldErrors)
        setSubmitError(
          hasConsoleApiFieldError(nextFieldErrors, organizationIdentityFields)
            ? undefined
            : getConsoleApiErrorText(
                error,
                "The organization could not be updated."
              )
        )
      }
    },
  })
  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((current) => clearConsoleApiFieldError(current, field))
    setSubmitError(undefined)
  }, [])
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
        onEdit={clearFieldError}
        serverErrors={fieldErrors.name}
        orientation="responsive"
        autoComplete="organization"
      />
    ),
    [clearFieldError, fieldErrors.name]
  )
  const renderSlugField = useCallback(
    (field: AnyFieldApi) => (
      <FormTextField
        field={field}
        id="organization-slug"
        label="Slug"
        description="Lowercase letters, numbers, and single hyphens only."
        onEdit={clearFieldError}
        serverErrors={fieldErrors.slug}
        orientation="responsive"
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
    ),
    [clearFieldError, fieldErrors.slug]
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
        <OrganizationProfileImage
          organization={organization}
          className="size-12"
        />
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

      <ProfileImageEditor
        subject="organization"
        organizationId={organization.id}
        name={organization.name}
        profileImage={organization.profileImage}
      />

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
          <LinkButton variant="ghost" href="/settings/organizations">
            Back to organizations
          </LinkButton>
          <form.Subscribe selector={selectSubmitState}>
            {renderSubmitButton}
          </form.Subscribe>
        </div>
      </form>

      <OrganizationDangerZone organization={organization} />
    </div>
  )
}
