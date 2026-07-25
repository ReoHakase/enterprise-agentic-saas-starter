import { isToolUIPart, type UIMessage } from "ai"
import * as v from "valibot"

import { pendingActionToolOutputSchema } from "./schema"

export const extractPendingActionIds = (messages: UIMessage[]) => {
  const ids = new Set<string>()
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part) || part.state !== "output-available") continue
      const parsed = v.safeParse(pendingActionToolOutputSchema, part.output)
      if (parsed.success) ids.add(parsed.output.actionId)
    }
  }
  return [...ids]
}
