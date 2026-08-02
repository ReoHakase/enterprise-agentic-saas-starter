"use client"

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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { type AnyFieldApi, useForm } from "@tanstack/react-form"
import { MailPlusIcon } from "lucide-react"
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react"

import { safeAuthErrorMessage } from "@/features/auth"
import {
  isStepUpRequiredError,
  getConsoleApiErrorText,
  getConsoleApiFieldError,
} from "@/features/console"
import { OrganizationRoleBadge } from "@/features/organizations"

import {
  invitationFormSchema,
  normalizeInvitationEmail,
  type InvitationInput,
  type InvitationFormValues,
} from "../../schema"

const invitationRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
] satisfies ReadonlyArray<{
  label: string
  value: InvitationFormValues["role"]
}>

const invitationDefaultValues: InvitationFormValues = {
  email: "",
  role: "member",
}

const inviteMemberTrigger = <Button className="w-full sm:w-auto" />

const selectSubmitState = (state: {
  canSubmit: boolean
  isSubmitting: boolean
}) => ({
  canSubmit: state.canSubmit,
  isSubmitting: state.isSubmitting,
})

const isInvitationRole = (value: string | null): value is "admin" | "member" =>
  value === "admin" || value === "member"

export const InviteMemberDialog = ({
  canInviteAdmins,
  pending,
  onInvite,
}: {
  canInviteAdmins: boolean
  pending: boolean
  onInvite: (value: InvitationInput) => Promise<unknown>
}) => {
  const [open, setOpen] = useState(false)
  const [emailError, setEmailError] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()
  const form = useForm({
    defaultValues: invitationDefaultValues,
    validators: { onSubmit: invitationFormSchema },
    onSubmit: async ({ value }) => {
      setEmailError(undefined)
      setSubmitError(undefined)
      try {
        await onInvite({
          email: normalizeInvitationEmail(value.email),
          role: value.role,
        })
        form.reset()
        setOpen(false)
      } catch (error) {
        if (isStepUpRequiredError(error)) return

        const fieldError = getConsoleApiFieldError(error, "email")
        setEmailError(fieldError)
        if (!fieldError) {
          const fallback = getConsoleApiErrorText(
            error,
            "The invitation could not be sent."
          )
          setSubmitError(safeAuthErrorMessage(error, fallback))
        }
      }
    },
  })
  const clearErrors = useCallback(() => {
    setEmailError(undefined)
    setSubmitError(undefined)
  }, [])
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && form.state.isSubmitting) {
        return
      }
      setOpen(nextOpen)
      if (!nextOpen) {
        form.reset()
        setEmailError(undefined)
        setSubmitError(undefined)
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={inviteMemberTrigger} disabled={pending}>
        <MailPlusIcon data-icon="inline-start" aria-hidden="true" />
        Invite member
      </DialogTrigger>
      <DialogContent>
        <form noValidate onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>
              Send an invitation to one email address. Ownership is transferred
              from the member table after additional confirmation.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <form.Field name="email">
              {(field) => (
                <InvitationEmailsField
                  field={field}
                  serverError={emailError}
                  onEdit={clearErrors}
                />
              )}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <InvitationRoleField
                  field={field}
                  canInviteAdmins={canInviteAdmins}
                />
              )}
            </form.Field>
            {submitError ? (
              <FieldError role="alert">{submitError}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={form.state.isSubmitting}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <form.Subscribe selector={selectSubmitState}>
              {({ canSubmit, isSubmitting }) => (
                <Button type="submit" disabled={!canSubmit || isSubmitting}>
                  {isSubmitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <MailPlusIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  Send invitation
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const InvitationEmailsField = ({
  field,
  serverError,
  onEdit,
}: {
  field: AnyFieldApi
  serverError?: string
  onEdit: () => void
}) => {
  const invalid =
    (field.state.meta.isTouched && !field.state.meta.isValid) ||
    Boolean(serverError)
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const localErrorId = locallyInvalid
    ? "invitation-emails-local-error"
    : undefined
  const serverErrorId = serverError
    ? "invitation-emails-server-error"
    : undefined
  const descriptionId = "invitation-emails-description"
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
      <FieldLabel htmlFor="invitation-email">Email address</FieldLabel>
      <Input
        id="invitation-email"
        type="email"
        name={field.name}
        value={value}
        onBlur={field.handleBlur}
        onChange={handleChange}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        autoCapitalize="none"
        autoComplete="email"
        placeholder="alex@example.com"
        spellCheck={false}
      />
      <FieldDescription id={descriptionId}>
        The invitation is sent immediately without automatic retry.
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

const InvitationRoleField = ({
  field,
  canInviteAdmins,
}: {
  field: AnyFieldApi
  canInviteAdmins: boolean
}) => {
  const value = isInvitationRole(
    typeof field.state.value === "string" ? field.state.value : null
  )
    ? field.state.value
    : "member"
  const descriptionId = canInviteAdmins
    ? undefined
    : "invitation-role-description"
  const handleValueChange = useCallback(
    (nextValue: string | null) => {
      if (isInvitationRole(nextValue)) {
        field.handleChange(nextValue)
      }
    },
    [field]
  )

  return (
    <Field>
      <FieldLabel htmlFor="invitation-role">Role</FieldLabel>
      <Select
        items={invitationRoleOptions}
        value={value}
        onValueChange={handleValueChange}
      >
        <SelectTrigger
          id="invitation-role"
          className="w-full"
          aria-label="Invitation role"
          aria-describedby={descriptionId}
        >
          <OrganizationRoleBadge role={value} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {invitationRoleOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.value === "admin" && !canInviteAdmins}
              >
                <OrganizationRoleBadge role={option.value} />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {!canInviteAdmins ? (
        <FieldDescription id={descriptionId}>
          Only the Owner can invite another Admin.
        </FieldDescription>
      ) : null}
    </Field>
  )
}
