import type { AgentComposerSnapshot } from "../components/agent-composer/agent-composer"

export const hasComposerContent = (snapshot: AgentComposerSnapshot) =>
  snapshot.parts.some(
    (part) =>
      part.type === "data-context-reference" ||
      (part.type === "text" && part.text.trim().length > 0)
  )
