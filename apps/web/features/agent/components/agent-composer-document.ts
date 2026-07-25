import type { JSONContent } from "@tiptap/core"

import type { AgentChatMessage } from "../schema"

const appendTextPart = (parts: AgentChatMessage["parts"], text: string) => {
  if (!text) return
  const previous = parts.at(-1)
  if (previous?.type === "text") previous.text += text
  else parts.push({ type: "text", text })
}

export const agentComposerDocumentToParts = (
  document: JSONContent
): AgentChatMessage["parts"] => {
  const parts: AgentChatMessage["parts"] = []
  const blocks = document.content ?? []
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) appendTextPart(parts, "\n")
    for (const node of block.content ?? []) {
      if (node.type === "text") {
        appendTextPart(parts, node.text ?? "")
        continue
      }
      if (node.type === "hardBreak") {
        appendTextPart(parts, "\n")
        continue
      }
      if (node.type !== "mention") continue
      const kind = node.attrs?.kind
      const label = node.attrs?.label
      if (typeof label !== "string") continue
      if (kind === "current_page" && typeof node.attrs?.path === "string") {
        parts.push({
          type: "data-context-reference",
          data: { kind, path: node.attrs.path, label },
        })
      } else if (
        (kind === "issue" || kind === "file" || kind === "member") &&
        typeof node.attrs?.resourceId === "string"
      ) {
        parts.push({
          type: "data-context-reference",
          data: { kind, id: node.attrs.resourceId, label },
        })
      }
    }
  })
  return parts
}
