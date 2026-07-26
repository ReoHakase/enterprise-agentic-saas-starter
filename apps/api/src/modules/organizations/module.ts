import type { Db } from "@enterprise-agentic-saas/db"
import { backgroundTaskHandler } from "@enterprise-agentic-saas/email/runtime"

import { getSessionContext } from "../auth/public"
import type {
  AccessControlFactory,
  AuthorizationService,
} from "../authorization/public"
import { createOrganizationDeletionAccessService } from "./deletion-access-service"
import { processConfiguredInvitationEmailJobs } from "./invitation-email-jobs"
import { reserveInvitationQuota } from "./invitation-rate-limit"
import { createInvitationService } from "./invitation-service"
import {
  cancelInvitationById,
  countSuperAdmins,
  deleteMemberById,
  deleteOrganizationById,
  findInvitationForResend,
  findMemberById,
  findOrganizationDeletionReceipt,
  findOrganizationForUser,
  insertInvitations,
  insertOrganizationWithSuperAdmin,
  listInvitationsByOrganization,
  listMembersByOrganization,
  listOrganizationsForUser,
  resendInvitationById,
  transferSuperAdminById,
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
    countSuperAdmins: (organizationId) => countSuperAdmins(db, organizationId),
    deleteMemberById: (input) => deleteMemberById(db, input),
    deleteOrganizationById: (input) => deleteOrganizationById(db, input),
    findMemberById: (input) => findMemberById(db, input),
    findOrganizationForUser: (input) => findOrganizationForUser(db, input),
    insertOrganizationWithSuperAdmin: (input) =>
      insertOrganizationWithSuperAdmin(db, input),
    listMembersByOrganization: (organizationId) =>
      listMembersByOrganization(db, organizationId),
    listOrganizationsForUser: (input) => listOrganizationsForUser(db, input),
    requireMembership: authorization.requireMembership,
    requireOrganizationRole: authorization.requireOrganizationRole,
    transferSuperAdminById: (input) => transferSuperAdminById(db, input),
    updateMemberRoleById: (input) => updateMemberRoleById(db, input),
    updateOrganizationById: (input) => updateOrganizationById(db, input),
    updateSessionActiveOrganization: (input) =>
      updateSessionActiveOrganization(db, input),
  })

  const invitationService = createInvitationService({
    cancelInvitationById: (input) => cancelInvitationById(db, input),
    dispatchInvitationEmailJobs: async () => {
      const deliveryTask = processConfiguredInvitationEmailJobs(db).catch(
        () => undefined
      )
      if (backgroundTaskHandler) {
        backgroundTaskHandler(deliveryTask)
        return
      }
      await deliveryTask
    },
    findInvitationForResend: (input) => findInvitationForResend(db, input),
    insertInvitations: (input) => insertInvitations(db, input),
    listInvitationsByOrganization: (organizationId) =>
      listInvitationsByOrganization(db, organizationId),
    requireOrganizationRole: authorization.requireOrganizationRole,
    reserveInvitationQuota: (input) => reserveInvitationQuota(db, input),
    resendInvitationById: (input) => resendInvitationById(db, input),
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
