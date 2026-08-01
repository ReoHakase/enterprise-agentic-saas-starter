import type {
  MastraDBMessage,
  MastraMessagePart,
} from "@mastra/core/agent/message-list"
import type { OutputProcessor } from "@mastra/core/processors"

const withoutTransientModelOutput = (
  part: MastraMessagePart
): MastraMessagePart => {
  const mastraMetadata = part.providerMetadata?.mastra
  if (!mastraMetadata || !Object.hasOwn(mastraMetadata, "modelOutput")) {
    return part
  }

  const { modelOutput: _transientModelOutput, ...persistentMastraMetadata } =
    mastraMetadata
  return {
    ...part,
    providerMetadata: {
      ...part.providerMetadata,
      mastra: persistentMastraMetadata,
    },
  }
}

export const productMemoryPersistenceGuard = {
  id: "product-memory-persistence-guard",
  processOutputResult: ({ messages }: { messages: MastraDBMessage[] }) =>
    messages.map((message) => ({
      ...message,
      content: {
        ...message.content,
        parts: message.content.parts.map(withoutTransientModelOutput),
      },
    })),
} satisfies OutputProcessor
