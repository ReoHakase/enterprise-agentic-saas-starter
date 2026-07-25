export const createInvitationPath = (invitationId: string) =>
  `/invitations/${encodeURIComponent(invitationId)}`
