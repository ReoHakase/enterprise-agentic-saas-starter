"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { useForm } from "@tanstack/react-form"
import { SaveIcon } from "lucide-react"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import {
  clearConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/features/console"

import { issueDescriptionFormSchema } from "../../schema"
import type { StringFieldApi, SubmitSelection } from "../form-types/form-types"
import { DescriptionEditorField } from "../issue-detail-editor-fields/issue-detail-editor-fields"
import type { IssueDetailProps } from "../issue-detail-types/issue-detail-types"
import { getActionErrorMessage } from "../issue-utils/issue-utils"
import type { IssueUiItem } from "../types/types"

export const useIssueDescriptionForm = ({
  issue,
  pending,
  onUpdate,
}: {
  issue: IssueUiItem
  pending?: boolean
  onUpdate: IssueDetailProps["onUpdate"]
}) => {
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const form = useForm({
    defaultValues: { description: issue.description },
    validators: { onSubmit: issueDescriptionFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdate) return

      setError(undefined)
      setFieldErrors({})
      try {
        const description = value.description.trim()
        const updated = await onUpdate(issue, { description })
        form.reset({ description: updated?.description ?? description })
        setEditing(false)
      } catch (cause) {
        const nextFieldErrors = getConsoleApiFieldErrors(cause)
        setFieldErrors(nextFieldErrors)
        setError(
          hasConsoleApiFieldError(nextFieldErrors, ["description"])
            ? undefined
            : getActionErrorMessage(
                cause,
                "The description could not be updated."
              )
        )
      }
    },
  })
  useEffect(() => {
    if (!editing && !form.state.isDirty) {
      // form resetではissue変更後のfield state更新を意図的にbatchする。
      // oxlint-disable-next-line react-doctor/no-chain-state-updates
      form.reset({ description: issue.description })
    }
  }, [editing, form, issue.description])
  const beginEdit = useCallback(() => {
    form.reset({ description: issue.description })
    setError(undefined)
    setFieldErrors({})
    setEditing(true)
  }, [form, issue.description])
  const cancelEdit = useCallback(() => {
    form.reset({ description: issue.description })
    setError(undefined)
    setFieldErrors({})
    setEditing(false)
  }, [form, issue.description])
  const clearErrors = useCallback(() => {
    setError(undefined)
    setFieldErrors((current) =>
      clearConsoleApiFieldError(current, "description")
    )
  }, [])
  const save = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const renderField = useCallback(
    (field: StringFieldApi) => (
      <DescriptionEditorField
        field={field}
        serverError={fieldErrors.description?.join(" ")}
        formError={error}
        onEdit={clearErrors}
      />
    ),
    [clearErrors, error, fieldErrors.description]
  )
  const renderSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        type="submit"
        disabled={
          pending || !onUpdate || !canSubmit || !isDirty || isSubmitting
        }
      >
        {pending || isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Save description
      </Button>
    ),
    [onUpdate, pending]
  )
  const applyDraft = useCallback(
    (description: string) => {
      form.setFieldValue("description", description)
      setEditing(true)
    },
    [form]
  )

  return {
    applyDraft,
    beginEdit,
    cancelEdit,
    editing,
    form,
    renderField,
    renderSubmit,
    save,
  }
}

export type IssueDescriptionFormState = ReturnType<
  typeof useIssueDescriptionForm
>
