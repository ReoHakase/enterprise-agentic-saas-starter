"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Separator } from "@enterprise-agentic-saas/ui/components/separator"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { useForm } from "@tanstack/react-form"
import {
  ArrowLeftIcon,
  HistoryIcon,
  Maximize2Icon,
  PencilIcon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import * as v from "valibot"

import { LocalDate } from "@/components/local-date"
import type { IssueUpdateField } from "@/features/issues/issue-update-state"
import {
  commentFormSchema,
  issueDescriptionFormSchema,
  issueTitleFormSchema,
} from "@/features/issues/schema"
import type { IssueTimelineItem } from "@/features/issues/schema"
import {
  clearConsoleApiFieldError,
  getConsoleApiFieldErrors,
  hasConsoleApiFieldError,
} from "@/lib/console-api"

import {
  selectSubmitState,
  type StringFieldApi,
  type SubmitSelection,
} from "./form-types"
import { IssueActivityItem } from "./issue-activity"
import { IssueComment } from "./issue-comment"
import {
  IssueAssigneeControl,
  IssueDueDateTimeControl,
  IssueLabelsControl,
  IssuePriorityControl,
  IssueStatusControl,
} from "./issue-metadata-controls"
import { useIssueModalNavigation } from "./issue-modal-route-shell"
import {
  emptyAssigneeOptions,
  getActionErrorMessage,
  getActionFieldError,
  issueNumber,
} from "./issue-utils"
import { CommentBodyFormField } from "./text-form-fields"
import type {
  AsyncAction,
  IssueAssigneeOption,
  IssueUiItem,
  IssueUpdate,
} from "./types"

type ImmediateField =
  | "status"
  | "priority"
  | "assigneeId"
  | "labels"
  | "dueDate"

const draftHandoffSchema = v.object({
  version: v.literal(1),
  issueId: v.string(),
  expiresAt: v.number(),
  title: v.string(),
  titleEditing: v.boolean(),
  description: v.string(),
  descriptionEditing: v.boolean(),
  comment: v.string(),
})

type DraftHandoff = v.InferOutput<typeof draftHandoffSchema>

const draftHandoffKey = (canonicalHref: string) =>
  `issue-draft-handoff:${canonicalHref}`
const issueHistoryGuardStateKey = "__issueDetailNavigationGuard"

const parseDraftHandoff = (value: unknown, issueId: string) => {
  const result = v.safeParse(draftHandoffSchema, value)
  if (
    !result.success ||
    result.output.issueId !== issueId ||
    result.output.expiresAt <= Date.now()
  ) {
    return undefined
  }
  return result.output
}

const MetadataField = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="flex min-w-0 flex-col gap-2">
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
    {children}
  </div>
)

const TitleEditorField = ({
  field,
  serverError,
  formError,
  onEdit,
  onCancel,
}: {
  field: StringFieldApi
  serverError?: string
  formError?: string
  onEdit: () => void
  onCancel: () => void
}) => {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onEdit()
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onCancel()
    },
    [onCancel]
  )

  return (
    <Field data-invalid={locallyInvalid || Boolean(serverError)}>
      <FieldLabel className="sr-only" htmlFor="issue-title">
        Issue title
      </FieldLabel>
      <Input
        ref={inputRef}
        id="issue-title"
        className="h-auto py-1 font-heading text-xl font-medium sm:text-2xl"
        value={field.state.value}
        maxLength={200}
        aria-invalid={locallyInvalid || Boolean(serverError)}
        onChange={handleChange}
        onBlur={field.handleBlur}
        onKeyDown={handleKeyDown}
      />
      {locallyInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
      {formError ? <FieldError role="alert">{formError}</FieldError> : null}
    </Field>
  )
}

const DescriptionEditorField = ({
  field,
  serverError,
  formError,
  onEdit,
}: {
  field: StringFieldApi
  serverError?: string
  formError?: string
  onEdit: () => void
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => textareaRef.current?.focus(), [])
  const locallyInvalid = field.state.meta.isTouched && !field.state.meta.isValid
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onEdit()
      field.handleChange(event.target.value)
    },
    [field, onEdit]
  )

  return (
    <Field data-invalid={locallyInvalid || Boolean(serverError)}>
      <FieldLabel className="sr-only" htmlFor="issue-description">
        Description
      </FieldLabel>
      <Textarea
        ref={textareaRef}
        id="issue-description"
        className="min-h-40 resize-y"
        value={field.state.value}
        maxLength={10_000}
        placeholder="Add context, acceptance criteria, or links."
        aria-invalid={locallyInvalid || Boolean(serverError)}
        onBlur={field.handleBlur}
        onChange={handleChange}
      />
      {locallyInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
      {serverError ? <FieldError role="alert">{serverError}</FieldError> : null}
      {formError ? <FieldError role="alert">{formError}</FieldError> : null}
    </Field>
  )
}

export const IssueDetailDialog = ({
  issue,
  assignees = emptyAssigneeOptions,
  labelSuggestions = issue.labels,
  timeline,
  nextCursor,
  canonicalHref,
  mode,
  pending,
  pendingFields = new Set(),
  loadingOlder,
  onLoadOlder,
  onUpdate,
  onCreateComment,
  onUpdateComment,
  onDeleteComment,
  onRequestClose,
}: {
  issue: IssueUiItem
  assignees?: IssueAssigneeOption[]
  labelSuggestions?: string[]
  timeline: IssueTimelineItem[]
  nextCursor: string | null
  canonicalHref: string
  mode: "modal" | "page"
  pending?: boolean
  pendingFields?: ReadonlySet<IssueUpdateField>
  loadingOlder?: boolean
  onLoadOlder: () => void
  onUpdate?: (
    issue: IssueUiItem,
    update: IssueUpdate
  ) => Promise<IssueUiItem | void>
  onCreateComment?: AsyncAction<[issue: IssueUiItem, body: string]>
  onUpdateComment?: AsyncAction<
    [issue: IssueUiItem, commentId: string, body: string]
  >
  onDeleteComment?: AsyncAction<[issue: IssueUiItem, commentId: string]>
  onRequestClose: () => void
}) => {
  const [titleEditing, setTitleEditing] = useState(false)
  const [descriptionEditing, setDescriptionEditing] = useState(false)
  const [titleError, setTitleError] = useState<string>()
  const [titleFieldErrors, setTitleFieldErrors] = useState<
    Record<string, string[]>
  >({})
  const [descriptionError, setDescriptionError] = useState<string>()
  const [descriptionFieldErrors, setDescriptionFieldErrors] = useState<
    Record<string, string[]>
  >({})
  const [commentError, setCommentError] = useState<string>()
  const [commentFieldError, setCommentFieldError] = useState<string>()
  const [navigationError, setNavigationError] = useState<string>()
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null)
  const [savingFields, setSavingFields] = useState<Set<ImmediateField>>(
    () => new Set()
  )
  const [dirtyCommentIds, setDirtyCommentIds] = useState<Set<string>>(
    () => new Set()
  )
  const allowBrowserNavigation = useRef(false)
  const hasUnsavedChangesRef = useRef<() => boolean>(() => false)
  const navigationBlockedRef = useRef(false)
  const rearmHistoryGuardRef = useRef<(() => void) | null>(null)
  const rearmHistoryOnCancelRef = useRef(false)
  const commentDirtyHandlers = useRef(
    new Map<string, (dirty: boolean) => void>()
  )

  const titleForm = useForm({
    defaultValues: { title: issue.title },
    validators: { onSubmit: issueTitleFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdate) return
      const title = value.title.trim()
      if (title === issue.title) {
        titleForm.reset({ title: issue.title })
        setTitleEditing(false)
        return
      }

      setTitleError(undefined)
      setTitleFieldErrors({})
      try {
        const updated = await onUpdate(issue, { title })
        titleForm.reset({ title: updated?.title ?? title })
        setTitleEditing(false)
      } catch (error) {
        const fieldErrors = getConsoleApiFieldErrors(error)
        setTitleFieldErrors(fieldErrors)
        setTitleError(
          hasConsoleApiFieldError(fieldErrors, ["title"])
            ? undefined
            : getActionErrorMessage(error, "The title could not be updated.")
        )
      }
    },
  })
  const descriptionForm = useForm({
    defaultValues: { description: issue.description },
    validators: { onSubmit: issueDescriptionFormSchema },
    onSubmit: async ({ value }) => {
      if (!onUpdate) return

      setDescriptionError(undefined)
      setDescriptionFieldErrors({})
      try {
        const updated = await onUpdate(issue, {
          description: value.description.trim(),
        })
        descriptionForm.reset({
          description: updated?.description ?? value.description.trim(),
        })
        setDescriptionEditing(false)
      } catch (error) {
        const fieldErrors = getConsoleApiFieldErrors(error)
        setDescriptionFieldErrors(fieldErrors)
        setDescriptionError(
          hasConsoleApiFieldError(fieldErrors, ["description"])
            ? undefined
            : getActionErrorMessage(
                error,
                "The description could not be updated."
              )
        )
      }
    },
  })
  const commentForm = useForm({
    defaultValues: { body: "" },
    validators: { onSubmit: commentFormSchema },
    onSubmit: async ({ value }) => {
      if (!onCreateComment) return

      setCommentError(undefined)
      setCommentFieldError(undefined)
      try {
        await onCreateComment(issue, value.body)
        commentForm.reset()
      } catch (error) {
        const fieldError = getActionFieldError(error, "body")
        setCommentFieldError(fieldError)
        setCommentError(
          fieldError
            ? undefined
            : getActionErrorMessage(error, "The comment could not be added.")
        )
      }
    },
  })

  useEffect(() => {
    if (!titleEditing && !titleForm.state.isDirty) {
      titleForm.reset({ title: issue.title })
    }
  }, [issue.title, titleEditing, titleForm])
  useEffect(() => {
    if (!descriptionEditing && !descriptionForm.state.isDirty) {
      descriptionForm.reset({ description: issue.description })
    }
  }, [descriptionEditing, descriptionForm, issue.description])

  useEffect(() => {
    if (mode !== "page") return
    const key = draftHandoffKey(canonicalHref)
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return
    window.sessionStorage.removeItem(key)

    try {
      const draft = parseDraftHandoff(JSON.parse(raw), issue.id)
      if (!draft) return

      if (draft.titleEditing) {
        setTitleEditing(true)
        titleForm.setFieldValue("title", draft.title)
      }
      if (draft.descriptionEditing) {
        setDescriptionEditing(true)
        descriptionForm.setFieldValue("description", draft.description)
      }
      if (draft.comment) commentForm.setFieldValue("body", draft.comment)
    } catch {
      // Invalid or stale handoff data is intentionally discarded.
    }
  }, [canonicalHref, commentForm, descriptionForm, issue.id, mode, titleForm])

  const hasUnsavedChanges = useCallback(
    () =>
      (titleEditing && titleForm.state.isDirty) ||
      (descriptionEditing && descriptionForm.state.isDirty) ||
      commentForm.state.isDirty ||
      dirtyCommentIds.size > 0,
    [
      commentForm,
      descriptionEditing,
      descriptionForm,
      dirtyCommentIds,
      titleEditing,
      titleForm,
    ]
  )
  const navigationBlocked = Boolean(pending) || savingFields.size > 0
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges])
  useEffect(() => {
    navigationBlockedRef.current = navigationBlocked
  }, [navigationBlocked])

  useEffect(() => {
    if (mode !== "page") return

    const guardMarker = `${canonicalHref}:${issue.id}`
    const rearmHistoryGuard = () => {
      const currentState = window.history.state
      if (
        currentState &&
        typeof currentState === "object" &&
        currentState[issueHistoryGuardStateKey] === guardMarker
      ) {
        return
      }
      const nextState =
        currentState && typeof currentState === "object"
          ? { ...currentState, [issueHistoryGuardStateKey]: guardMarker }
          : { [issueHistoryGuardStateKey]: guardMarker }
      window.history.pushState(nextState, "", window.location.href)
    }
    const continueBrowserBack = () => {
      rearmHistoryOnCancelRef.current = false
      allowBrowserNavigation.current = true
      window.setTimeout(() => window.history.back(), 0)
    }
    const handleBrowserBack = () => {
      if (allowBrowserNavigation.current) return
      if (navigationBlockedRef.current) {
        rearmHistoryGuard()
        return
      }
      if (hasUnsavedChangesRef.current()) {
        rearmHistoryOnCancelRef.current = true
        setPendingNavigation(() => continueBrowserBack)
        return
      }
      continueBrowserBack()
    }

    rearmHistoryGuardRef.current = rearmHistoryGuard
    rearmHistoryGuard()
    window.addEventListener("popstate", handleBrowserBack)
    return () => {
      window.removeEventListener("popstate", handleBrowserBack)
      if (rearmHistoryGuardRef.current === rearmHistoryGuard) {
        rearmHistoryGuardRef.current = null
      }
    }
  }, [canonicalHref, issue.id, mode])

  const isFieldSaving = useCallback(
    (field: ImmediateField) =>
      savingFields.has(field) || pendingFields.has(field),
    [pendingFields, savingFields]
  )
  const requestNavigation = useCallback(
    (action: () => void) => {
      if (navigationBlocked) return
      if (hasUnsavedChanges()) {
        setPendingNavigation(() => action)
        return
      }
      action()
    },
    [hasUnsavedChanges, navigationBlocked]
  )
  const guardedClose = useCallback(
    () => requestNavigation(onRequestClose),
    [onRequestClose, requestNavigation]
  )
  useIssueModalNavigation(mode === "modal" ? guardedClose : undefined)

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!allowBrowserNavigation.current && hasUnsavedChanges()) {
        event.preventDefault()
      }
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [hasUnsavedChanges])

  const updateImmediateField = useCallback(
    async (field: ImmediateField, update: IssueUpdate) => {
      if (!onUpdate) return
      setSavingFields((current) => new Set(current).add(field))
      try {
        await onUpdate(issue, update)
      } catch {
        // The controller reports mutation failures through the shared toast.
        // Keep fire-and-forget field changes from becoming unhandled rejections.
      } finally {
        setSavingFields((current) => {
          const next = new Set(current)
          next.delete(field)
          return next
        })
      }
    },
    [issue, onUpdate]
  )
  const changeStatus = useCallback(
    (status: IssueUiItem["status"]) =>
      void updateImmediateField("status", { status }),
    [updateImmediateField]
  )
  const changePriority = useCallback(
    (priority: IssueUiItem["priority"]) =>
      void updateImmediateField("priority", { priority }),
    [updateImmediateField]
  )
  const changeAssignee = useCallback(
    (assigneeId: string | null) =>
      void updateImmediateField("assigneeId", { assigneeId }),
    [updateImmediateField]
  )
  const changeLabels = useCallback(
    (labels: string[]) => void updateImmediateField("labels", { labels }),
    [updateImmediateField]
  )
  const changeDueDate = useCallback(
    (dueDate: string | null) =>
      void updateImmediateField("dueDate", { dueDate }),
    [updateImmediateField]
  )

  const beginTitleEdit = useCallback(() => {
    titleForm.reset({ title: issue.title })
    setTitleError(undefined)
    setTitleFieldErrors({})
    setTitleEditing(true)
  }, [issue.title, titleForm])
  const cancelTitleEdit = useCallback(() => {
    titleForm.reset({ title: issue.title })
    setTitleError(undefined)
    setTitleFieldErrors({})
    setTitleEditing(false)
  }, [issue.title, titleForm])
  const clearTitleErrors = useCallback(() => {
    setTitleError(undefined)
    setTitleFieldErrors((current) =>
      clearConsoleApiFieldError(current, "title")
    )
  }, [])
  const saveTitle = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void titleForm.handleSubmit()
    },
    [titleForm]
  )
  const beginDescriptionEdit = useCallback(() => {
    descriptionForm.reset({ description: issue.description })
    setDescriptionError(undefined)
    setDescriptionFieldErrors({})
    setDescriptionEditing(true)
  }, [descriptionForm, issue.description])
  const cancelDescriptionEdit = useCallback(() => {
    descriptionForm.reset({ description: issue.description })
    setDescriptionError(undefined)
    setDescriptionFieldErrors({})
    setDescriptionEditing(false)
  }, [descriptionForm, issue.description])
  const clearDescriptionErrors = useCallback(() => {
    setDescriptionError(undefined)
    setDescriptionFieldErrors((current) =>
      clearConsoleApiFieldError(current, "description")
    )
  }, [])
  const saveDescription = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void descriptionForm.handleSubmit()
    },
    [descriptionForm]
  )
  const createComment = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void commentForm.handleSubmit()
    },
    [commentForm]
  )
  const clearCommentError = useCallback(() => {
    setCommentFieldError(undefined)
    setCommentError(undefined)
  }, [])
  const handleCommentDirtyChange = useCallback(
    (commentId: string, dirty: boolean) => {
      setDirtyCommentIds((current) => {
        const next = new Set(current)
        if (dirty) next.add(commentId)
        else next.delete(commentId)
        return next
      })
    },
    []
  )
  const getCommentDirtyHandler = useCallback(
    (commentId: string) => {
      const existing = commentDirtyHandlers.current.get(commentId)
      if (existing) return existing
      const handler = (dirty: boolean) =>
        handleCommentDirtyChange(commentId, dirty)
      commentDirtyHandlers.current.set(commentId, handler)
      return handler
    },
    [handleCommentDirtyChange]
  )
  const backToIssues = useCallback(
    () => requestNavigation(onRequestClose),
    [onRequestClose, requestNavigation]
  )
  const navigateToFullPage = useCallback(
    (allowDiscard = false) => {
      setNavigationError(undefined)

      try {
        const draft: DraftHandoff = {
          version: 1,
          issueId: issue.id,
          expiresAt: Date.now() + 60_000,
          title: titleForm.state.values.title,
          titleEditing,
          description: descriptionForm.state.values.description,
          descriptionEditing,
          comment: commentForm.state.values.body,
        }
        window.sessionStorage.setItem(
          draftHandoffKey(canonicalHref),
          JSON.stringify(draft)
        )
      } catch {
        if (!allowDiscard && hasUnsavedChanges()) {
          setNavigationError(
            "Drafts could not be transferred to the full-page view. Keep editing here or discard them first."
          )
          return
        }
      }

      allowBrowserNavigation.current = true
      window.location.assign(canonicalHref)
    },
    [
      canonicalHref,
      commentForm,
      descriptionEditing,
      descriptionForm,
      hasUnsavedChanges,
      issue.id,
      titleEditing,
      titleForm,
    ]
  )
  const openFullPage = useCallback(() => {
    if (navigationBlocked) return
    setNavigationError(undefined)
    if (dirtyCommentIds.size > 0) {
      setPendingNavigation(() => () => navigateToFullPage(true))
      return
    }
    navigateToFullPage()
  }, [dirtyCommentIds.size, navigateToFullPage, navigationBlocked])
  const cancelDiscard = useCallback(() => {
    setPendingNavigation(null)
    if (rearmHistoryOnCancelRef.current) {
      rearmHistoryOnCancelRef.current = false
      rearmHistoryGuardRef.current?.()
    }
  }, [])
  const confirmDiscard = useCallback(() => {
    const action = pendingNavigation
    rearmHistoryOnCancelRef.current = false
    setPendingNavigation(null)
    allowBrowserNavigation.current = true
    action?.()
  }, [pendingNavigation])
  const handleDiscardOpenChange = useCallback(
    (open: boolean) => {
      if (!open) cancelDiscard()
    },
    [cancelDiscard]
  )

  const renderDescriptionSubmit = useCallback(
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
  const renderTitleSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        type="submit"
        size="sm"
        disabled={
          pending || !onUpdate || !canSubmit || !isDirty || isSubmitting
        }
      >
        {pending || isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SaveIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Save title
      </Button>
    ),
    [onUpdate, pending]
  )
  const renderTitleField = useCallback(
    (field: StringFieldApi) => (
      <TitleEditorField
        field={field}
        serverError={titleFieldErrors.title?.join(" ")}
        formError={titleError}
        onEdit={clearTitleErrors}
        onCancel={cancelTitleEdit}
      />
    ),
    [cancelTitleEdit, clearTitleErrors, titleError, titleFieldErrors.title]
  )
  const renderDescriptionField = useCallback(
    (field: StringFieldApi) => (
      <DescriptionEditorField
        field={field}
        serverError={descriptionFieldErrors.description?.join(" ")}
        formError={descriptionError}
        onEdit={clearDescriptionErrors}
      />
    ),
    [
      clearDescriptionErrors,
      descriptionError,
      descriptionFieldErrors.description,
    ]
  )
  const renderCommentSubmit = useCallback(
    ([canSubmit, isSubmitting, isDirty]: SubmitSelection) => (
      <Button
        className="self-end"
        type="submit"
        disabled={
          pending || !onCreateComment || !canSubmit || !isDirty || isSubmitting
        }
      >
        {isSubmitting ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SendIcon data-icon="inline-start" aria-hidden="true" />
        )}
        Comment
      </Button>
    ),
    [onCreateComment, pending]
  )
  const titleEditButton = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Edit issue title"
        disabled={navigationBlocked || !onUpdate}
        onClick={beginTitleEdit}
      />
    ),
    [beginTitleEdit, navigationBlocked, onUpdate]
  )
  const TitleHeading = mode === "page" ? "h1" : "h2"
  const content = (
    <section
      data-slot="issue-detail"
      data-testid="issue-detail"
      className={
        mode === "modal"
          ? "flex min-h-full flex-col gap-6 [--issue-timeline-surface:var(--popover)]"
          : "flex min-h-full flex-col gap-6 [--issue-timeline-surface:var(--background)]"
      }
    >
      {mode === "page" ? (
        <nav aria-label="Issue navigation">
          <Button
            className="-ml-2"
            type="button"
            variant="ghost"
            size="sm"
            disabled={navigationBlocked}
            onClick={backToIssues}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            Back to issues
          </Button>
        </nav>
      ) : null}

      <header
        data-slot="issue-detail-header"
        className={mode === "modal" ? "min-w-0 pr-12" : "min-w-0"}
      >
        <div
          className={
            titleEditing
              ? "flex min-w-0 flex-wrap items-start gap-2 sm:flex-nowrap"
              : "flex min-w-0 items-start gap-2"
          }
        >
          {titleEditing ? (
            <form
              className="order-2 flex w-full min-w-0 flex-wrap items-start gap-2 sm:order-1 sm:w-auto sm:flex-1"
              aria-label="Title editor"
              onSubmit={saveTitle}
            >
              <div className="min-w-40 flex-1">
                <titleForm.Field name="title">
                  {renderTitleField}
                </titleForm.Field>
              </div>
              <span className="mt-2 shrink-0 font-mono text-sm text-muted-foreground">
                {issueNumber(issue)}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={cancelTitleEdit}
                >
                  <XIcon data-icon="inline-start" aria-hidden="true" />
                  Cancel
                </Button>
                <titleForm.Subscribe selector={selectSubmitState}>
                  {renderTitleSubmit}
                </titleForm.Subscribe>
              </div>
            </form>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <TitleHeading
                tabIndex={mode === "page" ? -1 : undefined}
                className="min-w-0 truncate font-heading text-xl leading-tight font-medium sm:text-2xl"
                title={issue.title}
              >
                {issue.title}
              </TitleHeading>
              <span className="shrink-0 font-mono text-sm text-muted-foreground">
                {issueNumber(issue)}
              </span>
              <Tooltip>
                <TooltipTrigger render={titleEditButton}>
                  <PencilIcon aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Edit title</TooltipContent>
              </Tooltip>
            </div>
          )}
          {mode === "modal" ? (
            <Button
              className={
                titleEditing ? "order-1 ml-auto sm:order-2" : "ml-auto"
              }
              type="button"
              variant="outline"
              size="sm"
              aria-label="Open full page"
              disabled={navigationBlocked}
              onClick={openFullPage}
            >
              <Maximize2Icon data-icon="inline-start" aria-hidden="true" />
              Full page
            </Button>
          ) : null}
        </div>
        {navigationError ? (
          <FieldError className="mt-2" role="alert">
            {navigationError}
          </FieldError>
        ) : null}
      </header>

      <div
        data-slot="issue-detail-layout"
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start lg:gap-x-8"
      >
        <aside
          data-slot="issue-metadata"
          className="flex min-w-0 flex-col gap-5 border-t pt-6 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
          aria-label="Issue metadata"
        >
          <div>
            <h3 className="font-medium">Details</h3>
            <p className="text-xs text-muted-foreground">
              Changes apply immediately.
            </p>
          </div>
          <MetadataField label="Status">
            <IssueStatusControl
              value={issue.status}
              ariaLabel="Issue status"
              disabled={!onUpdate}
              busy={isFieldSaving("status")}
              onValueChange={changeStatus}
            />
          </MetadataField>
          <MetadataField label="Priority">
            <IssuePriorityControl
              value={issue.priority}
              ariaLabel="Issue priority"
              disabled={!onUpdate}
              busy={isFieldSaving("priority")}
              onValueChange={changePriority}
            />
          </MetadataField>
          <MetadataField label="Assignee">
            <IssueAssigneeControl
              value={issue.assigneeId}
              assignees={assignees}
              ariaLabel="Issue assignee"
              disabled={!onUpdate}
              busy={isFieldSaving("assigneeId")}
              onValueChange={changeAssignee}
            />
          </MetadataField>
          <MetadataField label="Labels">
            <IssueLabelsControl
              value={issue.labels}
              suggestions={labelSuggestions}
              ariaLabel="Issue labels"
              disabled={!onUpdate}
              busy={isFieldSaving("labels")}
              onValueChange={changeLabels}
            />
          </MetadataField>
          <MetadataField label="Due date and time">
            <IssueDueDateTimeControl
              value={issue.dueDate}
              ariaLabel="Issue due date and time"
              disabled={!onUpdate}
              busy={isFieldSaving("dueDate")}
              onValueChange={changeDueDate}
            />
          </MetadataField>
        </aside>

        <div
          data-slot="issue-primary-column"
          className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1"
          role="group"
          aria-label="Issue primary content"
        >
          <section
            data-slot="issue-description"
            className="min-w-0"
            aria-labelledby="description-heading"
          >
            <Card
              size="sm"
              className="min-w-0 gap-0 rounded-xl border py-0 shadow-none ring-0 dark:ring-0"
            >
              <CardHeader className="rounded-t-xl bg-muted/40 px-4 py-3">
                <div className="min-w-0">
                  <h3 id="description-heading" className="font-medium">
                    Description
                  </h3>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>
                      created at{" "}
                      <LocalDate value={issue.createdAt} includeTime />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      updated at{" "}
                      <LocalDate value={issue.updatedAt} includeTime />
                    </span>
                  </p>
                </div>
                {!descriptionEditing ? (
                  <CardAction className="-mt-1 -mr-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Edit description"
                      disabled={navigationBlocked || !onUpdate}
                      onClick={beginDescriptionEdit}
                    >
                      <PencilIcon data-icon="inline-start" aria-hidden="true" />
                      Edit
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <Separator />
              {descriptionEditing ? (
                <form onSubmit={saveDescription}>
                  <CardContent className="flex flex-col gap-3 px-4 py-4">
                    <descriptionForm.Field name="description">
                      {renderDescriptionField}
                    </descriptionForm.Field>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={cancelDescriptionEdit}
                      >
                        <XIcon data-icon="inline-start" aria-hidden="true" />
                        Cancel
                      </Button>
                      <descriptionForm.Subscribe selector={selectSubmitState}>
                        {renderDescriptionSubmit}
                      </descriptionForm.Subscribe>
                    </div>
                  </CardContent>
                </form>
              ) : (
                <CardContent className="min-h-24 px-4 py-4">
                  {issue.description ? (
                    <p className="text-sm leading-6 whitespace-pre-wrap">
                      {issue.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No description provided.
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          </section>

          <Separator />

          <section
            data-slot="issue-discussion"
            className="flex min-w-0 flex-col gap-5"
            aria-labelledby="discussion-heading"
          >
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 id="discussion-heading" className="font-medium">
                  Discussion
                </h3>
                <p className="text-sm text-muted-foreground">
                  Changes and comments, in chronological order.
                </p>
              </div>
              {nextCursor ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loadingOlder}
                  onClick={onLoadOlder}
                >
                  {loadingOlder ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HistoryIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  Load older
                </Button>
              ) : null}
            </div>

            {timeline.length > 0 ? (
              <ol className="relative flex min-w-0 flex-col gap-1">
                {timeline.map((item) =>
                  item.type === "activity" ? (
                    <IssueActivityItem
                      key={item.id}
                      activity={item}
                      assignees={assignees}
                    />
                  ) : (
                    <IssueComment
                      key={item.id}
                      issue={issue}
                      comment={item}
                      pending={pending}
                      onDirtyChange={getCommentDirtyHandler(item.id)}
                      onUpdateComment={onUpdateComment}
                      onDeleteComment={onDeleteComment}
                    />
                  )
                )}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No activity yet. Add the first comment below.
              </p>
            )}

            <form
              className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4"
              onSubmit={createComment}
            >
              <commentForm.Field name="body">
                {(field) => (
                  <CommentBodyFormField
                    field={field}
                    id="issue-comment-body"
                    label="Add comment"
                    placeholder="Share an update or decision."
                    className="min-h-28"
                    onEdit={clearCommentError}
                    serverError={commentFieldError}
                  />
                )}
              </commentForm.Field>
              {commentError ? (
                <FieldError role="alert">{commentError}</FieldError>
              ) : null}
              <commentForm.Subscribe selector={selectSubmitState}>
                {renderCommentSubmit}
              </commentForm.Subscribe>
            </form>
          </section>
        </div>
      </div>
    </section>
  )

  return (
    <>
      {mode === "modal" ? (
        content
      ) : (
        <article className="mx-auto w-full max-w-6xl">{content}</article>
      )}

      <AlertDialog
        open={pendingNavigation !== null}
        onOpenChange={handleDiscardOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your title, description, or comment draft will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              <Undo2Icon data-icon="inline-start" aria-hidden="true" />
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDiscard}>
              <Trash2Icon data-icon="inline-start" aria-hidden="true" />
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
