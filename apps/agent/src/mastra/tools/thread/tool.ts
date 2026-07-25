import { createTool } from "@mastra/core/tools"

import {
  getProductAgentRuntime,
  type ProductAgentRequestContext,
} from "../../runtime/request-context"
import { executeRenameThread } from "./execute"
import { renameThreadInputSchema } from "./schema"

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
  execute: async (input, context) => {
    const runtime = getProductAgentRuntime(context.requestContext)
    return executeRenameThread(input, runtime)
  },
})
