import { describe, expect, it } from "vitest"

import { createAgentStorage } from "../storage"
import { createProductAgentComposition } from "./create-product-agent"

describe("Product Agent compositionの契約", () => {
  it("Studio entrypointだけでtoolなしunscoped modelを有効にする", async () => {
    const studioStorage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "studio-composition"
    )
    const productionStorage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "production-composition"
    )
    const productionEnvironment = {
      MASTRA_DEV: "true",
      MASTRA_STORAGE_URL: ":memory:",
      NODE_ENV: "development",
      OPENROUTER_API_KEY: "test-openrouter-key",
    }
    const studio = createProductAgentComposition(
      {
        MASTRA_STORAGE_URL: ":memory:",
        NODE_ENV: "development",
        OPENROUTER_API_KEY: "test-openrouter-key",
      },
      studioStorage,
      { allowUnscopedModel: true }
    )
    const production = createProductAgentComposition(
      productionEnvironment,
      productionStorage
    )

    try {
      await expect(studio.productAgent.getModel()).resolves.toMatchObject({
        modelId: "openai/gpt-5.6-luna",
        provider: "openrouter",
      })
      await expect(studio.productAgent.getMemory()).resolves.toBeUndefined()
      expect(studio.productAgent.listTools()).toEqual({})
      await expect(production.productAgent.getMemory()).resolves.toBeDefined()
      await expect(production.productAgent.getModel()).rejects.toThrow(
        "Agent runtime capability is unavailable"
      )
    } finally {
      await Promise.all([studioStorage.close(), productionStorage.close()])
    }
  })

  it("明示的なStudio optionを開発環境だけに限定する", async () => {
    const storage = createAgentStorage(
      { MASTRA_STORAGE_URL: ":memory:", NODE_ENV: "test" },
      "production-studio-option"
    )
    const composition = createProductAgentComposition(
      {
        MASTRA_STORAGE_URL: ":memory:",
        NODE_ENV: "production",
        OPENROUTER_API_KEY: "test-openrouter-key",
      },
      storage,
      { allowUnscopedModel: true }
    )

    try {
      await expect(composition.productAgent.getMemory()).resolves.toBeDefined()
      await expect(composition.productAgent.getModel()).rejects.toThrow(
        "Agent runtime capability is unavailable"
      )
    } finally {
      await storage.close()
    }
  })
})
