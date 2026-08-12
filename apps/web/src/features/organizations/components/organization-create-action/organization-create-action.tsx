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
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import {
  clearConsoleApiFieldError,
  consoleKeys,
  getConsoleApiErrorText,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/features/console"
import { browserConsoleApi } from "@/lib/browser/console-api"

import { organizationFormSchema, toOrganizationSlug } from "../../schema"

const organizationCreateFields = ["name", "slug"] as const
const organizationCreateTrigger = <Button />

const selectCreateSubmitState = (state: {
  canSubmit: boolean
  isSubmitting: boolean
}) => ({
  canSubmit: state.canSubmit,
  isSubmitting: state.isSubmitting,
})

const OrganizationCreateAction = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const slugEditedRef = useRef(false)
  const createMutation = useMutation({
    mutationFn: (input: { name: string; slug: string }) =>
      browserConsoleApi.createOrganization(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: consoleKeys.organizations(),
      })
      setOpen(false)
      slugEditedRef.current = false
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
        slugEditedRef.current = false
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
        slugEditedRef.current = false
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
      if (!slugEditedRef.current) {
        form.setFieldValue("slug", toOrganizationSlug(name))
      }
    },
    [form]
  )
  const editOrganizationName = useCallback(() => {
    setFieldErrors((current) => {
      const withoutName = clearConsoleApiFieldError(current, "name")
      return slugEditedRef.current
        ? withoutName
        : clearConsoleApiFieldError(withoutName, "slug")
    })
    setSubmitError(undefined)
  }, [])
  const editOrganizationSlug = useCallback(() => {
    slugEditedRef.current = true
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

export { OrganizationCreateAction as organizationCreateAction }
