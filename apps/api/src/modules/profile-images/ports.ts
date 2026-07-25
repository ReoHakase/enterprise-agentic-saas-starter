import type { FileStorageRuntime } from "../files/public"
import type { ProfileImageSubject } from "./constants"

export type StoredProfileImage = {
  createdAt: Date
  etag: null | string
  fallbackUrl: null | string
  id: string
  objectKey: string
  organizationId: null | string
  sourceHash: string
  status: "pending" | "ready" | "superseded"
  subjectId: string
  subjectType: "organization" | "user"
  updatedAt: Date
  uploadId: string
  userId: null | string
  version: number
}

export type ProfileImagePorts = {
  deleteProfileImage(input: {
    actorUserId: string
    sessionId?: string
    subject: ProfileImageSubject
  }): Promise<boolean>
  finalizePendingProfileImage(input: {
    actorUserId: string
    etag: string
    id: string
    profileImagePath: string
    sessionId?: string
    subject: ProfileImageSubject
  }): Promise<
    | { image: StoredProfileImage; kind: "ready" }
    | { kind: "missing" }
    | { kind: "superseded" }
  >
  findReadyProfileImage(
    subject: ProfileImageSubject
  ): Promise<StoredProfileImage | null>
  getRuntime(): FileStorageRuntime
  reservePendingProfileImage(input: {
    id: string
    objectKey: string
    sourceHash: string
    subject: ProfileImageSubject
    uploadId: string
  }): Promise<{ created: boolean; image: StoredProfileImage }>
  supersedePendingProfileImage(image: StoredProfileImage): Promise<boolean>
}
