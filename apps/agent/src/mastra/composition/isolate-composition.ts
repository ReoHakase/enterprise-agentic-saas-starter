import type { AgentRuntimeEnv } from "./environment"
import { createAgentRuntimeComposition } from "./runtime-composition"

type AgentRuntimeComposition = ReturnType<typeof createAgentRuntimeComposition>

const createAgentIsolateComposition = () => {
  let cached:
    | {
        authToken?: string
        composition: AgentRuntimeComposition
        modelApiKey?: string
        modelBaseUrl?: string
        storageUrl?: string
      }
    | undefined

  return (environment: AgentRuntimeEnv): AgentRuntimeComposition => {
    if (cached) {
      if (
        cached.authToken !== environment.MASTRA_STORAGE_AUTH_TOKEN ||
        cached.modelApiKey !== environment.OPENROUTER_API_KEY ||
        cached.modelBaseUrl !== environment.OPENROUTER_BASE_URL ||
        cached.storageUrl !== environment.MASTRA_STORAGE_URL
      ) {
        throw new Error("Agent storage configuration is unavailable")
      }
      return cached.composition
    }
    const composition = createAgentRuntimeComposition(environment)
    cached = {
      authToken: environment.MASTRA_STORAGE_AUTH_TOKEN,
      composition,
      modelApiKey: environment.OPENROUTER_API_KEY,
      modelBaseUrl: environment.OPENROUTER_BASE_URL,
      storageUrl: environment.MASTRA_STORAGE_URL,
    }
    return composition
  }
}

export const getAgentIsolateComposition = createAgentIsolateComposition()
