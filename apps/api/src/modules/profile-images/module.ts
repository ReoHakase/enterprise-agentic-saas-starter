import type { Db } from "@enterprise-agentic-saas/db"

import type { AccessControlFactory } from "../authorization/public"
import { getFileStorageRuntime } from "../files/public"
import {
  deleteProfileImage,
  finalizePendingProfileImage,
  findReadyProfileImage,
  reservePendingProfileImage,
  supersedePendingProfileImage,
} from "./repository"
import { createProfileImageRoutes } from "./routes"
import { createProfileImageService } from "./service"

/** @internal */
export const createProfileImagesApplication = (db: Db) =>
  createProfileImageService({
    deleteProfileImage: (input) => deleteProfileImage(db, input),
    finalizePendingProfileImage: (input) =>
      finalizePendingProfileImage(db, input),
    findReadyProfileImage: (subject) => findReadyProfileImage(db, subject),
    getRuntime: getFileStorageRuntime,
    reservePendingProfileImage: (input) =>
      reservePendingProfileImage(db, input),
    supersedePendingProfileImage: (image) =>
      supersedePendingProfileImage(db, image),
  })

export const createProfileImagesModule = (
  db: Db,
  createAccessControl: AccessControlFactory
) =>
  createProfileImageRoutes(
    createProfileImagesApplication(db),
    createAccessControl
  )
