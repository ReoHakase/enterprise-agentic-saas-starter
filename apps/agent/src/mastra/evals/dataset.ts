import { z } from "zod"

import { parseAgentEvalToolAllowlist } from "../core/policy/eval-tool-allowlist"

const toolNameSchema = z.enum([
  "add_issue_attachments",
  "create_issue",
  "get_issue",
  "read_issue_attachment_image",
  "remove_issue_attachments",
  "search_issues",
  "web_search",
])
const baseCase = {
  availableTools: z.array(toolNameSchema).min(1),
  id: z.string().min(1),
  prompt: z.string().min(1),
  requiredTool: toolNameSchema,
  trials: z.number().int().min(1).max(3),
} as const
const caseSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...baseCase,
      expectedPriority: z.enum([
        "no_priority",
        "low",
        "medium",
        "high",
        "urgent",
      ]),
      kind: z.literal("read"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      expectedQuery: z.string().min(1),
      kind: z.literal("web_search"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      expectedIssue: z
        .object({
          priority: z.enum(["high"]),
          title: z.string().min(1),
        })
        .strict(),
      kind: z.literal("write"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      kind: z.literal("web_search_refusal"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      kind: z.literal("image_read"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      kind: z.literal("attachment_add"),
    })
    .strict(),
  z
    .object({
      ...baseCase,
      kind: z.literal("attachment_remove"),
    })
    .strict(),
])
const datasetSchema = z
  .object({
    cases: z.array(caseSchema).min(1),
    version: z.string().min(1),
  })
  .strict()

export type AgentEvalCase = z.infer<typeof caseSchema>

export const parseAgentEvalDataset = (value: unknown) => {
  const dataset = datasetSchema.parse(value)
  if (
    new Set(dataset.cases.map((item) => item.id)).size !== dataset.cases.length
  ) {
    throw new Error("Agent eval dataset contains duplicate IDs")
  }
  for (const item of dataset.cases) {
    parseAgentEvalToolAllowlist(JSON.stringify(item.availableTools))
    if (!item.availableTools.includes(item.requiredTool)) {
      throw new Error(`Agent eval case ${item.id} requires an unavailable tool`)
    }
  }
  return dataset
}
