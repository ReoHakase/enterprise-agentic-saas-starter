export {
  ensureAgentSessionContextInTransaction,
  revokeAgentSessionContextsInTransaction,
} from "./context/repository"
export { hashAgentToken } from "./crypto"
export { validateGrantInTransaction } from "./threads/auth-repository"
export type { ValidGrant } from "./threads/domain"
export {
  AGENT_USAGE_DAY_MS,
  AGENT_USAGE_HOUR_MS,
  consumeAgentResourceLimitInTransaction,
  hashedAgentUsageOperationId,
  purgeExpiredAgentResourceUsage,
  utcUsageWindow,
} from "./usage/resource-limits"

/** @internal */
export const createAgentInternalApi = async (
  ...args: Parameters<typeof createAgentInternalApiImplementation>
) => {
  const { createAgentInternalApi: create } = await import("./internal-api")
  return create(...args)
}

/** @internal */
export const createAgentInternalApp = async (
  ...args: Parameters<typeof createAgentInternalAppImplementation>
) => {
  const { createAgentInternalApp: create } = await import("./internal-api")
  return create(...args)
}

/** @internal */
export const issueAgentConnectionTicket = async (
  ...args: Parameters<typeof issueAgentConnectionTicketImplementation>
) => {
  const { issueAgentConnectionTicket: issue } =
    await import("./threads/thread-repository")
  return issue(...args)
}

import type {
  createAgentInternalApi as createAgentInternalApiImplementation,
  createAgentInternalApp as createAgentInternalAppImplementation,
} from "./internal-api"
import type { issueAgentConnectionTicket as issueAgentConnectionTicketImplementation } from "./threads/thread-repository"
