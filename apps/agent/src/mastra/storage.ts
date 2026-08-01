import { LibSQLStore } from "@mastra/libsql"

const LOCAL_STORAGE_URL =
  "https://agent-storage.enterprise-agentic-saas.localhost"

export type AgentStorageEnvironment = {
  MASTRA_STORAGE_AUTH_TOKEN?: string
  MASTRA_STORAGE_URL?: string
  NODE_ENV?: string
}

const isRemoteDatabaseUrl = (value: string): boolean =>
  value.startsWith("libsql://") || value.startsWith("https://")

const resolveAgentStorageConfig = (
  environment: AgentStorageEnvironment
): { authToken?: string; url: string } => {
  const nodeEnvironment = environment.NODE_ENV ?? "development"
  const url =
    environment.MASTRA_STORAGE_URL?.trim() ||
    (nodeEnvironment === "test" ? ":memory:" : LOCAL_STORAGE_URL)
  if (nodeEnvironment === "production") {
    if (
      !environment.MASTRA_STORAGE_URL ||
      !environment.MASTRA_STORAGE_AUTH_TOKEN ||
      !isRemoteDatabaseUrl(url)
    ) {
      throw new Error("Agent storage configuration is unavailable")
    }
  }

  return {
    ...(environment.MASTRA_STORAGE_AUTH_TOKEN
      ? { authToken: environment.MASTRA_STORAGE_AUTH_TOKEN }
      : {}),
    url,
  }
}

export const createAgentStorage = (
  environment: AgentStorageEnvironment,
  id = "product-agent-storage"
): LibSQLStore =>
  new LibSQLStore({
    id,
    ...resolveAgentStorageConfig(environment),
  })
