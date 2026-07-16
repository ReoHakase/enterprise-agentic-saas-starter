const legacyInvitationPrefix = "/organization/invitations/"
const organizationSections = new Set(["members", "settings"])

export const createInvitationPath = (invitationId: string) =>
  `/invitations/${encodeURIComponent(invitationId)}`

export const getLegacyInvitationRedirectPath = (pathname: string) => {
  if (!pathname.startsWith(legacyInvitationPrefix)) return undefined

  const segment = pathname
    .slice(legacyInvitationPrefix.length)
    .replace(/\/$/u, "")
  if (!segment || segment.includes("/") || organizationSections.has(segment)) {
    return undefined
  }

  return `/invitations/${segment}`
}
