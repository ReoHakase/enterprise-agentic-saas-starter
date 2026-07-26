import type { Db } from "@enterprise-agentic-saas/db"

import { createAuthorizationModule } from "../authorization/public"
import { createFilesApplication } from "./module"

type FilesTestApplication = ReturnType<typeof createFilesApplication>

const filesApplication = (db: Db) =>
  createFilesApplication(db, createAuthorizationModule(db).authorization)

export const uploadFile = (
  db: Db,
  input: Parameters<FilesTestApplication["uploadFile"]>[0]
) => filesApplication(db).uploadFile(input)

export const downloadFile = (
  db: Db,
  input: Parameters<FilesTestApplication["downloadFile"]>[0]
) => filesApplication(db).downloadFile(input)

export const previewFile = (
  db: Db,
  input: Parameters<FilesTestApplication["previewFile"]>[0]
) => filesApplication(db).previewFile(input)

export const previewTextFile = (
  db: Db,
  input: Parameters<FilesTestApplication["previewTextFile"]>[0]
) => filesApplication(db).previewTextFile(input)

export const removeFile = (
  db: Db,
  input: Parameters<FilesTestApplication["removeFile"]>[0]
) => filesApplication(db).removeFile(input)
