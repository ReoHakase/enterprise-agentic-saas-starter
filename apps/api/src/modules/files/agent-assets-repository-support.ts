import type { Db } from "@enterprise-agentic-saas/db"

export type AgentAssetTransaction = Parameters<
  Parameters<Db["transaction"]>[0]
>[0]
