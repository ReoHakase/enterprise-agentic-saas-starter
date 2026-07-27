"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@enterprise-agentic-saas/ui/components/tooltip"
import { ArrowLeftIcon, PencilIcon, XIcon } from "lucide-react"
import { useMemo } from "react"

import { selectSubmitState } from "../form-types/form-types"
import { issueNumber } from "../issue-utils/issue-utils"
import type { IssueUiItem } from "../types/types"
import type { IssueDetailNavigationState } from "../use-issue-detail-navigation/use-issue-detail-navigation"
import type { IssueTitleFormState } from "../use-issue-title-form/use-issue-title-form"

export const issueDetailBackNavigation = ({
  blocked,
  onBack,
}: {
  blocked: boolean
  onBack: () => void
}) => (
  <nav aria-label="Issue navigation">
    <Button
      className="-ml-2"
      type="button"
      variant="ghost"
      size="sm"
      disabled={blocked}
      onClick={onBack}
    >
      <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
      Back to issues
    </Button>
  </nav>
)

const IssueTitleEditor = ({
  issue,
  pending,
  title,
}: {
  issue: IssueUiItem
  pending?: boolean
  title: IssueTitleFormState
}) => (
  <form
    className="order-2 flex w-full min-w-0 flex-wrap items-start gap-2 sm:order-1 sm:w-auto sm:flex-1"
    aria-label="Title editor"
    onSubmit={title.save}
  >
    <div className="min-w-40 flex-1">
      <title.form.Field name="title">{title.renderField}</title.form.Field>
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
        onClick={title.cancelEdit}
      >
        <XIcon data-icon="inline-start" aria-hidden="true" />
        Cancel
      </Button>
      <title.form.Subscribe selector={selectSubmitState}>
        {title.renderSubmit}
      </title.form.Subscribe>
    </div>
  </form>
)

const IssueTitleDisplay = ({
  issue,
  navigationBlocked,
  canUpdate,
  onEdit,
}: {
  issue: IssueUiItem
  navigationBlocked: boolean
  canUpdate: boolean
  onEdit: () => void
}) => {
  const editButton = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Edit issue title"
        disabled={navigationBlocked || !canUpdate}
        onClick={onEdit}
      />
    ),
    [canUpdate, navigationBlocked, onEdit]
  )
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <h1
        tabIndex={-1}
        className="min-w-0 truncate font-heading text-xl leading-tight font-medium sm:text-2xl"
        title={issue.title}
      >
        {issue.title}
      </h1>
      <span className="shrink-0 font-mono text-sm text-muted-foreground">
        {issueNumber(issue)}
      </span>
      <Tooltip>
        <TooltipTrigger render={editButton}>
          <PencilIcon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Edit title</TooltipContent>
      </Tooltip>
    </div>
  )
}

export const issueDetailHeader = ({
  issue,
  pending,
  canUpdate,
  title,
  navigation,
}: {
  issue: IssueUiItem
  pending?: boolean
  canUpdate: boolean
  title: IssueTitleFormState
  navigation: IssueDetailNavigationState
}) => (
  <header data-slot="issue-detail-header" className="min-w-0">
    <div
      className={
        title.editing
          ? "flex min-w-0 flex-wrap items-start gap-2 sm:flex-nowrap"
          : "flex min-w-0 items-start gap-2"
      }
    >
      {title.editing ? (
        <IssueTitleEditor issue={issue} pending={pending} title={title} />
      ) : (
        <IssueTitleDisplay
          issue={issue}
          navigationBlocked={navigation.blocked}
          canUpdate={canUpdate}
          onEdit={title.beginEdit}
        />
      )}
    </div>
  </header>
)
