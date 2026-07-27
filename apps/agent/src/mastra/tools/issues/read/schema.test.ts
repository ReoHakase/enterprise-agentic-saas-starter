import {
  standardSchemaToJSONSchema,
  toStandardSchema,
} from "@mastra/core/schema"
import { describe, expect, it } from "vitest"

import { issueAttachmentImageInputSchema } from "./schema"

describe("issueAttachmentImageInputSchema", () => {
  it("converts to the provider JSON Schema used by Mastra routing", () => {
    expect(
      standardSchemaToJSONSchema(
        toStandardSchema(issueAttachmentImageInputSchema)
      )
    ).toMatchObject({
      additionalProperties: false,
      properties: {
        fileId: { pattern: "^[A-Za-z0-9_-]{1,128}$" },
        issueId: { pattern: "^[A-Za-z0-9_-]{1,128}$" },
      },
      required: ["fileId", "issueId"],
      type: "object",
    })
  })
})
