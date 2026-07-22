import { createTool } from "@mastra/core/tools"
import { z } from "zod"

import {
  getProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../runtime-context"

const renameThreadInputSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
  })
  .strict()

export const renameThreadTool = createTool<
  "rename_thread",
  typeof renameThreadInputSchema,
  undefined,
  undefined,
  undefined,
  ProductAgentRequestContext
>({
  id: "rename_thread",
  description:
    "Give the current untitled thread a concise title after the first meaningful user request. This can succeed at most once and never requires approval.",
  inputSchema: renameThreadInputSchema,
  strict: true,
  mcp: {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    },
  },
  execute: (input, context) => {
    const runtime = getProductAgentRuntime(context.requestContext)
    runtime.budget.consume("client")
    return runtime.api.renameThread({
      grant: runtime.runGrant,
      title: input.title,
    })
  },
})
