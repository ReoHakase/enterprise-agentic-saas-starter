import { toStandardJsonSchema } from "@valibot/to-json-schema"
import * as v from "valibot"

const identifierSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{1,128}$/))

const issueAttachmentImageInputValueSchema = v.strictObject({
  fileId: identifierSchema,
  issueId: identifierSchema,
})

export const issueAttachmentImageInputSchema = toStandardJsonSchema(
  issueAttachmentImageInputValueSchema
)

export type AgentIssueAttachmentImageInput = v.InferOutput<
  typeof issueAttachmentImageInputValueSchema
>

export type AgentIssueAttachmentImageResult = {
  contentType: "image/webp"
  fileId: string
  issueId: string
  sizeBytes: number
}
