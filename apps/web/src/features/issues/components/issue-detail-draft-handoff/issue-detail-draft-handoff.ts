import * as v from "valibot"

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

export type DraftHandoff = v.InferOutput<typeof draftHandoffSchema>

export const draftHandoffKey = (canonicalHref: string) =>
  `issue-draft-handoff:${canonicalHref}`

export const parseDraftHandoff = (value: unknown, issueId: string) => {
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
