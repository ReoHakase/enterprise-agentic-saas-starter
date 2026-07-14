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
import { useCallback, useState, type FormEvent } from "react"

import { createIssueFormSchema } from "@/features/issues/schema"

import {
  selectSubmitState,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import { getActionErrorMessage, getActionFieldError } from "./issue-utils"
import { CreateIssueTitleField } from "./text-form-fields"
import type { AsyncAction } from "./types"

export const CreateIssueDialog = ({
  pending,
  onCreate,
}: {
  pending?: boolean
  onCreate: AsyncAction<[title: string]>
}) => {
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
        setTitleError(getActionFieldError(cause, "title"))
        setCreateError(
          getActionErrorMessage(cause, "The issue could not be created.")
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
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen && !form.state.isSubmitting) {
        form.reset()
        setCreateError(undefined)
        setTitleError(undefined)
      }
    },
    [form]
  )
  const closeDialog = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  )
  const renderTitleField = useCallback(
    (field: StringFieldApi) => (
      <CreateIssueTitleField field={field} serverError={titleError} />
    ),
    [titleError]
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
      <DialogTrigger render={<Button />}>
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
