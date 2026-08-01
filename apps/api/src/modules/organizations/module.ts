import type { Db } from "@enterprise-agentic-saas/db"

import { getSessionContext } from "../auth/public"
import type {
  AccessControlFactory,
  AuthorizationService,
} from "../authorization/public"
import { createOrganizationDeletionAccessService } from "./deletion-access-service"
import { createInvitationService } from "./invitation-service"
import {
  cancelInvitationById,
  countOwners,
  deleteMemberById,
  deleteOrganizationById,
  findMemberById,
  findOrganizationDeletionReceipt,
  findOrganizationForUser,
  insertOrganizationWithOwner,
  listInvitationsByOrganization,
  listMembersByOrganization,
  listOrganizationsForUser,
  transferOwnershipById,
  updateMemberRoleById,
  updateOrganizationById,
  updateSessionActiveOrganization,
} from "./repository"
import { createOrganizationsRoutes } from "./routes"
import { createOrganizationsService } from "./service"

/** @internal */
export const createOrganizationsApplication = (
  db: Db,
  authorization: AuthorizationService
) => {
  const service = createOrganizationsService({
    countOwners: (organizationId) => countOwners(db, organizationId),
    deleteMemberById: (input) => deleteMemberById(db, input),
    deleteOrganizationById: (input) => deleteOrganizationById(db, input),
    findMemberById: (input) => findMemberById(db, input),
    findOrganizationForUser: (input) => findOrganizationForUser(db, input),
    insertOrganizationWithOwner: (input) =>
      insertOrganizationWithOwner(db, input),
    listMembersByOrganization: (organizationId) =>
      listMembersByOrganization(db, organizationId),
    listOrganizationsForUser: (input) => listOrganizationsForUser(db, input),
    requireMembership: authorization.requireMembership,
    requireOrganizationRole: authorization.requireOrganizationRole,
    transferOwnershipById: (input) => transferOwnershipById(db, input),
    updateMemberRoleById: (input) => updateMemberRoleById(db, input),
    updateOrganizationById: (input) => updateOrganizationById(db, input),
    updateSessionActiveOrganization: (input) =>
      updateSessionActiveOrganization(db, input),
  })

  const invitationService = createInvitationService({
    cancelInvitationById: (input) => cancelInvitationById(db, input),
    listInvitationsByOrganization: (organizationId) =>
      listInvitationsByOrganization(db, organizationId),
    requireOrganizationRole: authorization.requireOrganizationRole,
  })

  const deletionAccessService = createOrganizationDeletionAccessService({
    findOrganizationDeletionReceipt: (input) =>
      findOrganizationDeletionReceipt(db, input),
    requireMembership: authorization.requireMembership,
  })

  return { deletionAccessService, invitationService, service }
}

export const createOrganizationsModule = (
  db: Db,
  authorization: AuthorizationService,
  createAccessControl: AccessControlFactory
) => {
  const application = createOrganizationsApplication(db, authorization)
  return createOrganizationsRoutes(
    application.service,
    application.invitationService,
    application.deletionAccessService,
    createAccessControl,
    getSessionContext
  )
}
