import type { AuditPorts } from "./ports"

export const createAuditService = (ports: AuditPorts) => ({
  listEvents: ports.listEvents,
})

export type AuditService = ReturnType<typeof createAuditService>
