import type { Db } from "@enterprise-agentic-saas/db"

import type {
  AccessControlFactory,
  AuthorizationService,
} from "../authorization/public"
import {
  deleteIssueById,
  deleteIssueCommentById,
  findIssueById,
  findIssueByNumber,
  findIssueCommentById,
  getEffectiveIssueThumbnail,
  insertIssue,
  insertIssueComment,
  listIssueComments,
  listIssuePageByOrganization,
  listIssueTimeline,
  setIssueThumbnail,
  updateIssueById,
  updateIssueCommentById,
} from "./repository"
import { createIssuesRoutes } from "./routes"
import { createIssuesService } from "./service"

export const createIssuesModule = (
  db: Db,
  authorization: AuthorizationService,
  createAccessControl: AccessControlFactory
) =>
  createIssuesRoutes(
    createIssuesService({
      deleteComment: (input) => deleteIssueCommentById(db, input),
      deleteIssue: (input) => deleteIssueById(db, input),
      findComment: (input) => findIssueCommentById(db, input),
      findIssue: (input) => findIssueById(db, input),
      findIssueByNumber: (input) => findIssueByNumber(db, input),
      getMembership: authorization.getMembership,
      getThumbnail: (input) => getEffectiveIssueThumbnail(db, input),
      insertComment: (input) => insertIssueComment(db, input),
      insertIssue: (input) => insertIssue(db, input),
      listComments: (input) => listIssueComments(db, input),
      listIssues: (input) => listIssuePageByOrganization(db, input),
      listTimeline: (input) => listIssueTimeline(db, input),
      requireMembership: authorization.requireMembership,
      setThumbnail: (input) => setIssueThumbnail(db, input),
      updateComment: (input) => updateIssueCommentById(db, input),
      updateIssue: (input) => updateIssueById(db, input),
    }),
    createAccessControl
  )
