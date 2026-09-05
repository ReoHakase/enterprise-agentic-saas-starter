import type {
  AgentThreadSwitchRisks,
  OrganizationSwitchRisks,
} from "../runtime-state-types/runtime-state-types"

export const hasOrganizationSwitchRisks = (risks: OrganizationSwitchRisks) =>
  Object.values(risks).some(Boolean)

export const hasBlockingThreadSwitchRisks = (risks: AgentThreadSwitchRisks) =>
  risks.uploads || risks.activeTurn || risks.pendingApprovals
