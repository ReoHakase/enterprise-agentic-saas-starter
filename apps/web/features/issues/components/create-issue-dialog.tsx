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
  FieldError,
  FieldGroup,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { PlusIcon } from "lucide-react"
import { useCallback, useMemo, useState, type FormEvent } from "react"
import * as v from "valibot"

import { useRegisterAgentForm } from "@/features/agent/form-registry"
import { createIssueFormSchema } from "@/features/issues/schema"

import {
  selectSubmitState,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import { getActionErrorMessage, getActionFieldError } from "./issue-utils"
import { CreateIssueTitleField } from "./text-form-fields"
import type { AsyncAction } from "./types"

const createIssueTrigger = <Button />

export const CreateIssueDialog = ({
  organizationId,
  pending,
  onCreate,
}: {
  organizationId: string
  pending?: boolean
  onCreate: AsyncAction<[title: string]>
}) => {
  const [formEpoch, setFormEpoch] = useState(() => crypto.randomUUID())
  const [open, setOpen] = useState(false)
  const [createError, setCreateError] = useState<string>()
  const [titleError, setTitleError] = useState<string>()
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onSubmit: createIssueFormSchema },
    onSubmit: async ({ value }) => {
      setCreateError(undefined)
      setTitleError(undefined)
      try {
        await onCreate(value.title)
        form.reset()
        setOpen(false)
      } catch (cause) {
        const fieldError = getActionFieldError(cause, "title")
        setTitleError(fieldError)
        setCreateError(
          fieldError
            ? undefined
            : getActionErrorMessage(cause, "The issue could not be created.")
        )
      }
    },
  })
  const agentFormAdapter = useMemo(
    () =>
      open
        ? {
            formId: "issue:create",
            organizationId,
            resource: "issue" as const,
            epoch: formEpoch,
            read: () => ({
              values: { title: form.state.values.title },
              dirtyFields: form.state.isDirty ? ["title" as const] : [],
            }),
            validate: (patch: { title?: string; description?: string }) => {
              if (
                Object.keys(patch).length !== 1 ||
                typeof patch.title !== "string"
              ) {
                return {
                  success: false as const,
                  message: "The create Issue form only accepts a title patch.",
                }
              }
              const result = v.safeParse(createIssueFormSchema, {
                title: patch.title,
              })
              return result.success
                ? {
                    success: true as const,
                    patch: { title: result.output.title },
                  }
                : {
                    success: false as const,
                    message: "The proposed Issue title is invalid.",
                  }
            },
            apply: (patch: { title?: string }) => {
              if (patch.title !== undefined) {
                form.setFieldValue("title", patch.title)
              }
            },
          }
        : null,
    [form, formEpoch, open, organizationId]
  )
  useRegisterAgentForm(agentFormAdapter)
  const clearCreateError = useCallback(() => {
    setCreateError(undefined)
    setTitleError(undefined)
  }, [])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !open) setFormEpoch(crypto.randomUUID())
      setOpen(nextOpen)
      if (!nextOpen && !form.state.isSubmitting) {
        form.reset()
        setCreateError(undefined)
        setTitleError(undefined)
      }
    },
    [form, open]
  )
  const closeDialog = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  )
  const renderTitleField = useCallback(
    (field: StringFieldApi) => (
      <CreateIssueTitleField
        field={field}
        onEdit={clearCreateError}
        serverError={titleError}
      />
    ),
    [clearCreateError, titleError]
  )
  const renderSubmit = useCallback(
    ([canSubmit, isSubmitting]: SubmitSelection) => (
      <Button type="submit" disabled={pending || !canSubmit || isSubmitting}>
        {pending || isSubmitting ? <Spinner data-icon="inline-start" /> : null}
        Create issue
      </Button>
    ),
    [pending]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={createIssueTrigger}>
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        New issue
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create issue</DialogTitle>
            <DialogDescription>
              Start with a clear outcome. You can add more context from the
              issue detail view.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <form.Field name="title">{renderTitleField}</form.Field>
            {createError ? (
              <FieldError role="alert">{createError}</FieldError>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <form.Subscribe selector={selectSubmitState}>
              {renderSubmit}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
