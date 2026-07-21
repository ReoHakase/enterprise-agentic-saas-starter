import type { ProfileImageSubjectType } from "@enterprise-agentic-saas/db/schema"

export const PROFILE_IMAGE_SIZE = 512 as const
export const PROFILE_IMAGE_SOURCE_MAX_BYTES = 5_000_000 as const
export const PROFILE_IMAGE_SOURCE_CONTENT_TYPE = "image/png" as const
export const PROFILE_IMAGE_OUTPUT_CONTENT_TYPE = "image/webp" as const
export const PROFILE_IMAGE_OUTPUT_MAX_BYTES = 2_000_000 as const
export const PROFILE_IMAGE_OUTPUT_QUALITY = 85 as const

export type ProfileImageSubject = {
  type: ProfileImageSubjectType
  id: string
}

const encoded = (value: string) => encodeURIComponent(value)

export const profileImageObjectKey = (input: {
  id: string
  subject: ProfileImageSubject
}) =>
  input.subject.type === "user"
    ? `users/${encoded(input.subject.id)}/profile-images/${encoded(input.id)}.webp`
    : `organizations/${encoded(input.subject.id)}/profile-images/${encoded(input.id)}.webp`

export const profileImagePath = (
  subject: ProfileImageSubject,
  revision?: string
) => {
  const path =
    subject.type === "user"
      ? `/files/profile-images/users/${encoded(subject.id)}`
      : `/files/profile-images/organizations/${encoded(subject.id)}`
  return revision ? `${path}?v=${encoded(revision)}` : path
}
