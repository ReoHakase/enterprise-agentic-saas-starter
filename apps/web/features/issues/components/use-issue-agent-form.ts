"use client"

import { useMemo, useState } from "react"
import * as v from "valibot"

import { useRegisterAgentForm } from "@/features/agent/form-registry.public"

import type { IssueUiItem } from "./types"
import type { IssueDescriptionFormState } from "./use-issue-description-form"
import type { IssueTitleFormState } from "./use-issue-title-form"

const agentIssueDraftPatchSchema = v.partial(
  v.strictObject({
    title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    description: v.pipe(v.string(), v.maxLength(10_000)),
  })
)

export const useIssueAgentForm = ({
  issue,
  organizationId,
  title,
  description,
}: {
  issue: IssueUiItem
  organizationId?: string
  title: IssueTitleFormState
  description: IssueDescriptionFormState
}) => {
  const [epoch] = useState(() => crypto.randomUUID())
  const titleForm = title.form
  const descriptionForm = description.form
  const applyTitleDraft = title.applyDraft
  const applyDescriptionDraft = description.applyDraft
  const adapter = useMemo(
    () =>
      organizationId
        ? {
            formId: `issue:${issue.id}`,
            organizationId,
            resource: "issue" as const,
            resourceId: issue.id,
            revision: issue.revision,
            epoch,
            read: () => ({
              values: {
                title: titleForm.state.values.title,
                description: descriptionForm.state.values.description,
              },
              dirtyFields: [
                ...(titleForm.state.isDirty ? (["title"] as const) : []),
                ...(descriptionForm.state.isDirty
                  ? (["description"] as const)
                  : []),
              ],
            }),
            validate: (patch: { title?: string; description?: string }) => {
              if (Object.keys(patch).length === 0) {
                return {
                  success: false as const,
                  message: "At least one Issue draft field is required.",
                }
              }
              const result = v.safeParse(agentIssueDraftPatchSchema, patch)
              return result.success
                ? { success: true as const, patch: result.output }
                : {
                    success: false as const,
                    message: "The proposed Issue draft fields are invalid.",
                  }
            },
            apply: (patch: { title?: string; description?: string }) => {
              if (patch.title !== undefined) applyTitleDraft(patch.title)
              if (patch.description !== undefined) {
                applyDescriptionDraft(patch.description)
              }
            },
          }
        : null,
    [
      applyDescriptionDraft,
      applyTitleDraft,
      descriptionForm,
      epoch,
      issue.id,
      issue.revision,
      organizationId,
      titleForm,
    ]
  )
  useRegisterAgentForm(adapter)
}
