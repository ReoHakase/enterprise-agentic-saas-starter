"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { type AnyFieldApi, useForm } from "@tanstack/react-form"
import {
  CrownIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserMinusIcon,
} from "lucide-react"
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from "react"

import { isStepUpRequiredError } from "@/features/console/api.public"
import {
  getConsoleApiErrorText,
  getConsoleApiFieldError,
} from "@/features/console/error.public"

import {
  createMemberConfirmationFormSchema,
  type MemberConfirmationFormValues,
  type OrganizationMember,
} from "../schema"

export type StepUpRequest = {
  action?: string
  maxAgeSeconds?: number
}

const confirmationDefaultValues: MemberConfirmationFormValues = {
  confirmation: "",
}

const selectConfirmationSubmitState = (state: {
  canSubmit: boolean
  isSubmitting: boolean
  values: MemberConfirmationFormValues
}) => ({
  canSubmit: state.canSubmit,
  confirmation: state.values.confirmation,
  isSubmitting: state.isSubmitting,
})

export const MemberConfirmationDialog = ({
  action,
  member,
  pending,
  onClose,
  onConfirm,
}: {
  action: "remove" | "transfer"
  member: OrganizationMember
  pending: boolean
  onClose: () => void
  onConfirm: (
    member: OrganizationMember,
    confirmation: string
  ) => Promise<unknown>
}) => {
  const [confirmationError, setConfirmationError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const schema = useMemo(
    () => createMemberConfirmationFormSchema(member.email, action),
    [action, member.email]
  )
  const form = useForm({
    defaultValues: confirmationDefaultValues,
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setConfirmationError(undefined)
      setSubmitError(undefined)
      try {
        await onConfirm(member, value.confirmation)
        form.reset()
        onClose()
      } catch (error) {
        if (isStepUpRequiredError(error)) return

        const fieldError = getConsoleApiFieldError(error, "confirmation")
        setConfirmationError(fieldError)
        if (!fieldError) {
          setSubmitError(
            getConsoleApiErrorText(
              error,
              action === "transfer"
                ? "Super Admin could not be transferred."
                : "The member could not be removed."
            )
          )
        }
      }
    },
  })
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !form.state.isSubmitting) {
        form.reset()
        setConfirmationError(undefined)
        setSubmitError(undefined)
        onClose()
      }
    },
    [form, onClose]
  )
  const clearErrors = useCallback(() => {
    setConfirmationError(undefined)
    setSubmitError(undefined)
  }, [])
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const transfer = action === "transfer"

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form className="grid gap-6" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogMedia>
              {transfer ? (
                <CrownIcon aria-hidden="true" />
              ) : (
                <UserMinusIcon aria-hidden="true" />
              )}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {transfer
                ? `Transfer Super Admin to ${member.name}?`
                : `Remove ${member.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {transfer
                ? "The current Super Admin becomes an Admin, and ownership plus destructive authority moves immediately."
                : "This immediately revokes the member's access to this organization."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form.Field name="confirmation">
            {(field) => (
              <ConfirmationField
                field={field}
                memberEmail={member.email}
                serverError={confirmationError}
                onEdit={clearErrors}
              />
            )}
          </form.Field>
          {submitError ? (
            <FieldError role="alert">{submitError}</FieldError>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <form.Subscribe selector={selectConfirmationSubmitState}>
              {({ canSubmit, confirmation, isSubmitting }) => (
                <AlertDialogAction
                  type="submit"
                  variant="destructive"
                  disabled={
                    !canSubmit ||
                    isSubmitting ||
                    pending ||
                    confirmation.length === 0
                  }
                >
                  {isSubmitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : transfer ? (
                    <CrownIcon data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <Trash2Icon data-icon="inline-start" aria-hidden="true" />
                  )}
                  {transfer ? "Transfer Super Admin" : "Remove member"}
                </AlertDialogAction>
              )}
            </form.Subscribe>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const ConfirmationField = ({
  field,
  memberEmail,
  serverError,
  onEdit,
}: {
  field: AnyFieldApi
  memberEmail: string
  serverError?: string
  onEdit: () => void
}) => {
  const invalid =
    (field.state.meta.isTouched && !field.state.meta.isValid) ||
    Boolean(serverError)
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const descriptionId = "member-confirmation-description"
  const localErrorId = locallyInvalid
    ? "member-confirmation-local-error"
    : undefined
  const serverErrorId = serverError
    ? "member-confirmation-server-error"
    : undefined
  const describedBy = [descriptionId, localErrorId, serverErrorId]
    .filter((value): value is string => Boolean(value))
    .join(" ")
  const value = typeof field.state.value === "string" ? field.state.value : ""
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="member-confirmation">Member email</FieldLabel>
      <Input
        id="member-confirmation"
        name={field.name}
        type="email"
        value={value}
        onBlur={field.handleBlur}
        onChange={handleChange}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        placeholder={memberEmail}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
      <FieldDescription id={descriptionId}>
        Type <strong>{memberEmail}</strong> exactly.
      </FieldDescription>
      {locallyInvalid ? (
        <FieldError id={localErrorId} errors={field.state.meta.errors} />
      ) : null}
      {serverError ? (
        <FieldError id={serverErrorId} role="alert">
          {serverError}
        </FieldError>
      ) : null}
    </Field>
  )
}

export const StepUpDialog = ({
  request,
  onClose,
}: {
  request: StepUpRequest | null
  onClose: () => void
}) => {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose()
      }
    },
    [onClose]
  )
  const signInAgain = useCallback(() => {
    const redirectTo = `${globalThis.location.pathname}${globalThis.location.search}`
    const action = request?.action ?? "organization.manage"
    globalThis.location.assign(
      `/auth/sign-in?reauth=1&action=${encodeURIComponent(action)}&redirectTo=${encodeURIComponent(redirectTo)}`
    )
  }, [request?.action])

  return (
    <AlertDialog open={request !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldCheckIcon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Confirm it is really you</AlertDialogTitle>
          <AlertDialogDescription>
            This security-sensitive change needs a recent sign-in
            {request?.maxAgeSeconds
              ? ` from the last ${Math.floor(request.maxAgeSeconds / 60)} minutes`
              : ""}
            . Sign in again, then return and retry the change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={signInAgain}>
            <ShieldCheckIcon data-icon="inline-start" aria-hidden="true" />
            Sign in again
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
