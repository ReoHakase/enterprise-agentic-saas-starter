import type { MastraCompositeStore } from "@mastra/core/storage"
import { Memory } from "@mastra/memory"

export const createProductAgentMemory = (storage: MastraCompositeStore) =>
  new Memory({
    storage,
    options: {
      generateTitle: false,
      lastMessages: 50,
      semanticRecall: false,
      workingMemory: { enabled: false },
    },
  })
