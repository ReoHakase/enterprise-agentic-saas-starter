import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@enterprise-agentic-saas/ui/components/card"
import { Separator } from "@enterprise-agentic-saas/ui/components/separator"
import { PencilIcon, XIcon } from "lucide-react"

import { LocalDate } from "@/components/local-date/local-date"

import { selectSubmitState } from "../form-types/form-types"
import type { IssueUiItem } from "../types/types"
import type { IssueDescriptionFormState } from "../use-issue-description-form/use-issue-description-form"

const IssueDescriptionBody = ({ issue }: { issue: IssueUiItem }) => (
  <CardContent className="min-h-24 p-4">
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
)

const IssueDescriptionEditor = ({
  pending,
  description,
}: {
  pending?: boolean
  description: IssueDescriptionFormState
}) => (
  <form onSubmit={description.save}>
    <CardContent className="flex flex-col gap-3 p-4">
      <description.form.Field name="description">
        {description.renderField}
      </description.form.Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={description.cancelEdit}
        >
          <XIcon data-icon="inline-start" aria-hidden="true" />
          Cancel
        </Button>
        <description.form.Subscribe selector={selectSubmitState}>
          {description.renderSubmit}
        </description.form.Subscribe>
      </div>
    </CardContent>
  </form>
)

export const issueDetailDescription = ({
  issue,
  pending,
  navigationBlocked,
  canUpdate,
  description,
}: {
  issue: IssueUiItem
  pending?: boolean
  navigationBlocked: boolean
  canUpdate: boolean
  description: IssueDescriptionFormState
}) => (
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
              created at <LocalDate value={issue.createdAt} includeTime />
            </span>
            <span aria-hidden="true">·</span>
            <span>
              updated at <LocalDate value={issue.updatedAt} includeTime />
            </span>
          </p>
        </div>
        {!description.editing ? (
          <CardAction className="-mt-1 -mr-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Edit description"
              disabled={navigationBlocked || !canUpdate}
              onClick={description.beginEdit}
            >
              <PencilIcon data-icon="inline-start" aria-hidden="true" />
              Edit
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <Separator />
      {description.editing ? (
        <IssueDescriptionEditor pending={pending} description={description} />
      ) : (
        <IssueDescriptionBody issue={issue} />
      )}
    </Card>
  </section>
)
