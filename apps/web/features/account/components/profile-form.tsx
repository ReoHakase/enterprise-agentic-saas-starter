"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react"
import { toast } from "sonner"

import { UserIdentity } from "@/components/user-identity"
import { profileFormSchema, type UserProfile } from "@/features/account/schema"
import { consoleKeys } from "@/features/console/queries"
import { browserConsoleApi } from "@/lib/browser/console-api"
import { ConsoleApiError } from "@/lib/console-api"

const selectProfileSubmitState = (state: {
  canSubmit: boolean
  isDirty: boolean
  isSubmitting: boolean
}) => ({
  canSubmit: state.canSubmit,
  isDirty: state.isDirty,
  isSubmitting: state.isSubmitting,
})

export const ProfileForm = ({ user }: { user: UserProfile }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = useState<string>()
  const [nameError, setNameError] = useState<string>()
  const updateMutation = useMutation({
    mutationFn: (input: { name: string }) => browserConsoleApi.updateMe(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: consoleKeys.me() })
      router.refresh()
      toast.success("Profile updated")
    },
  })
  const form = useForm({
    defaultValues: { name: user.name },
    validators: { onSubmit: profileFormSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      setNameError(undefined)
      try {
        const updated = await updateMutation.mutateAsync(value)
        form.reset({ name: updated.name })
      } catch (error) {
        setNameError(
          error instanceof ConsoleApiError
            ? error.fieldErrors.name?.[0]
            : undefined
        )
        setSubmitError(
          error instanceof Error ? error.message : "The profile was not saved."
        )
      }
    },
  })
  const submitProfile = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border p-4 sm:p-5"
      aria-labelledby="profile-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="profile-heading" className="font-medium">
            Profile
          </h2>
          <p className="text-sm text-muted-foreground">
            This identity is shown to organization members and in comments.
          </p>
        </div>
        <UserIdentity user={user} avatarClassName="size-10" />
      </div>
      <form className="flex flex-col gap-4" onSubmit={submitProfile}>
        <FieldGroup className="max-w-2xl">
          <form.Field name="name">
            {(field) => {
              const invalid =
                field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid} orientation="responsive">
                  <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                  <div className="w-full sm:max-w-md">
                    <ProfileNameInput
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onValueChange={field.handleChange}
                      aria-invalid={invalid}
                    />
                    <FieldDescription className="mt-2">
                      Email is managed by your authentication account.
                    </FieldDescription>
                    {invalid ? (
                      <FieldError
                        className="mt-2"
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                    {nameError ? (
                      <FieldError className="mt-2" role="alert">
                        {nameError}
                      </FieldError>
                    ) : null}
                  </div>
                </Field>
              )
            }}
          </form.Field>
          {submitError ? (
            <FieldError role="alert">{submitError}</FieldError>
          ) : null}
        </FieldGroup>
        <form.Subscribe selector={selectProfileSubmitState}>
          {({ canSubmit, isSubmitting, isDirty }) => (
            <Button
              className="self-end"
              type="submit"
              disabled={!canSubmit || !isDirty || isSubmitting}
            >
              {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
              Save profile
            </Button>
          )}
        </form.Subscribe>
      </form>
    </section>
  )
}

const ProfileNameInput = ({
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "autoComplete" | "onChange"> & {
  onValueChange: (value: string) => void
}) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value),
    [onValueChange]
  )

  return <Input {...props} autoComplete="name" onChange={handleChange} />
}
