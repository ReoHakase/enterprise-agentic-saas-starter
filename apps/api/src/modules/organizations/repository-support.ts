const errorChainText = (cause: unknown) => {
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
