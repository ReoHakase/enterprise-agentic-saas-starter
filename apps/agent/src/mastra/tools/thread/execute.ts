import type { z } from "zod"

import type { ProductAgentRuntime } from "../../runtime/request-context"
import type { renameThreadInputSchema } from "./schema"

export const executeRenameThread = async (
  input: z.output<typeof renameThreadInputSchema>,
  runtime: ProductAgentRuntime
) => {
  runtime.budget.consume("client")
  const result = await runtime.api.renameThread({
    grant: runtime.runGrant,
    title: input.title,
  })
  runtime.onThreadTitle?.(result)
  return result
}
