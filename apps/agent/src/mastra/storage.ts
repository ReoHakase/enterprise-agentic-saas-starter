import { LibSQLStore } from "@mastra/libsql"
import type { LibSQLConfig } from "@mastra/libsql"

const LOCAL_STORAGE_URL =
  "https://agent-storage.enterprise-agentic-saas.localhost"

export type AgentStorageEnvironment = {
  MASTRA_STORAGE_AUTH_TOKEN?: string
  MASTRA_STORAGE_URL?: string
  NODE_ENV?: string
}

const isRemoteDatabaseUrl = (value: string): boolean =>
  value.startsWith("libsql://") || value.startsWith("https://")

const requiresSerializedInitialization = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      url.protocol === "http:" ||
      (url.protocol === "https:" &&
        (url.hostname === "localhost" || url.hostname.endsWith(".localhost")))
    )
  } catch {
    return false
  }
}

class AgentLibSQLStore extends LibSQLStore {
  readonly #serializeInitialization: boolean
  #serializedInitialization?: Promise<void>

  constructor(config: LibSQLConfig, serializeInitialization: boolean) {
    super(config)
    this.#serializeInitialization = serializeInitialization
  }

  override init(): Promise<void> {
    if (!this.#serializeInitialization) {
      return super.init()
    }
    if (this.#serializedInitialization) {
      return this.#serializedInitialization
    }

    const attempt = this.#initializeDomainsSequentially()
    const wrapped = attempt.catch((cause: unknown) => {
      if (this.#serializedInitialization === wrapped) {
        this.#serializedInitialization = undefined
      }
      throw cause
    })
    this.#serializedInitialization = wrapped
    return wrapped
  }

  async #initializeDomainsSequentially(): Promise<void> {
    for (const store of Object.values(this.stores)) {
      // oxlint-disable-next-line no-await-in-loop -- concurrent local HTTP domain initialization invalidates libSQL statements.
      await store?.init()
    }
  }
}

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
): LibSQLStore => {
  const config = resolveAgentStorageConfig(environment)
  return new AgentLibSQLStore(
    {
      id,
      ...config,
    },
    requiresSerializedInitialization(config.url)
  )
}
