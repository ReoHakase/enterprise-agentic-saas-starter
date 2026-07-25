import { publicErrors } from "../../errors/app-error"

export const errorChainText = (cause: unknown) => {
  const details: string[] = []
  const visited = new Set<unknown>()
  let current = cause
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current)
    details.push(current.message)
    const code = "code" in current ? current.code : undefined
    if (typeof code === "string") {
      details.push(code)
    }
    current = current.cause
  }
  return details.join("\n")
}

export const isOrganizationSlugConflict = (cause: unknown) => {
  const details = errorChainText(cause)
  return (
    details.includes("organization.slug") ||
    details.includes("organization_slug_uidx")
  )
}

export const isDeletionRequestConflict = (cause: unknown) => {
  const details = errorChainText(cause)
  return (
    details.includes("organization_deletion_jobs_request_uidx") ||
    details.includes(
      "organization_deletion_jobs.requested_by_user_id, organization_deletion_jobs.idempotency_key"
    )
  )
}

const invitationQueues = new Map<string, Promise<void>>()
const noop = () => {}

export const invitationEmailConflict = () =>
  publicErrors.conflict("One or more emails cannot be invited", {
    field: "emails",
    reason: "conflict",
    resource: "invitation",
  })

export const invitationResendRecipientConflict = () =>
  publicErrors.conflict("Invitation cannot be resent", {
    reason: "invitation_recipient_conflict",
    resource: "invitation",
  })

export const invitationLifetimeMs = 48 * 60 * 60 * 1000

export const withInvitationLock = async <T>(
  key: string,
  operation: () => Promise<T>
) => {
  const previous = invitationQueues.get(key) ?? Promise.resolve()
  let release = noop
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  invitationQueues.set(key, queued)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (invitationQueues.get(key) === queued) {
      invitationQueues.delete(key)
    }
  }
}

export const orderedUniqueKeys = (keys: readonly string[]) => {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const key of keys) {
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    let index = 0
    while (index < ordered.length && (ordered[index] ?? "") < key) {
      index += 1
    }
    ordered.splice(index, 0, key)
  }
  return ordered
}

export const withInvitationLocks = <T>(
  keys: readonly string[],
  operation: () => Promise<T>,
  index = 0
): Promise<T> => {
  const key = keys[index]
  return key
    ? withInvitationLock(key, () =>
        withInvitationLocks(keys, operation, index + 1)
      )
    : operation()
}
