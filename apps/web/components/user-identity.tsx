import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"

import { clientEnv } from "@/lib/env.client"
import { getSafeProfileImageUrl } from "@/lib/profile-image-url"

export type UserIdentityValue = {
  name?: string | null
  email?: string | null
  profileImage?: string | null
}

export const getUserInitials = ({ name, email }: UserIdentityValue) => {
  const normalizedName = name?.trim()
  if (normalizedName) {
    const parts = normalizedName.split(/\s+/).filter(Boolean)
    return (
      parts.length > 1
        ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
        : normalizedName.slice(0, 2)
    ).toUpperCase()
  }

  return email?.trim().slice(0, 2).toUpperCase() || "?"
}

export const UserProfileImage = ({
  user,
  className,
}: {
  user: UserIdentityValue
  className?: string
}) => (
  <Avatar shape="circle" className={cn("size-9 shrink-0", className)}>
    <AvatarImage
      src={getSafeProfileImageUrl(
        user.profileImage,
        clientEnv.NEXT_PUBLIC_API_BASE_URL
      )}
      alt={user.name?.trim() || user.email?.trim() || "User"}
    />
    <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
  </Avatar>
)

export const UserIdentity = ({
  user,
  className,
  profileImageClassName,
}: {
  user: UserIdentityValue
  className?: string
  profileImageClassName?: string
}) => (
  <div className={cn("flex min-w-0 items-center gap-3", className)}>
    <UserProfileImage user={user} className={profileImageClassName} />
    <div className="min-w-0">
      <p className="truncate text-sm font-medium">
        {user.name?.trim() || user.email?.trim() || "Unknown user"}
      </p>
      {user.email && user.email !== user.name ? (
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      ) : null}
    </div>
  </div>
)
