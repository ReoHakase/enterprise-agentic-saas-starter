import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { Building2Icon, CheckIcon } from "lucide-react"

import { UserProfileImage } from "@/components/user-identity/user-identity"
import { clientEnv } from "@/lib/env.client"
import { getSafeProfileImageUrl } from "@/lib/profile-image-url"

import type { OrganizationSummary } from "../../schema"
import { OrganizationRoleBadge } from "../organization-role-badge/organization-role-badge"

export type OrganizationIdentityValue = {
  name?: string | null
  profileImage?: string | null
}

export const OrganizationProfileImage = ({
  organization,
  className,
}: {
  organization: OrganizationIdentityValue
  className?: string
}) => (
  <Avatar shape="rounded" className={cn("size-9 shrink-0", className)}>
    <AvatarImage
      src={getSafeProfileImageUrl(
        organization.profileImage,
        clientEnv.NEXT_PUBLIC_API_BASE_URL
      )}
      alt={organization.name?.trim() || "Organization"}
    />
    <AvatarFallback>
      <Building2Icon aria-hidden="true" className="size-1/2" />
    </AvatarFallback>
  </Avatar>
)

export const OrganizationIdentity = ({
  organization,
  className,
  showRole = false,
}: {
  organization: OrganizationSummary
  className?: string
  showRole?: boolean
}) => (
  <div className={cn("flex min-w-52 items-center gap-3", className)}>
    <OrganizationProfileImage organization={organization} className="size-10" />
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate font-medium">{organization.name}</p>
        {organization.active ? (
          <Badge variant="outline">
            <CheckIcon aria-hidden="true" /> Active
          </Badge>
        ) : null}
      </div>
      <AvatarGroup
        className="mt-1"
        aria-label={`${organization.memberCount} organization members`}
      >
        {organization.memberProfileImages.slice(0, 3).map((member) => (
          <UserProfileImage
            key={member.userId}
            user={member}
            className="size-6"
          />
        ))}
        {organization.memberCount > 3 ? (
          <AvatarGroupCount className="size-6 text-xs">
            +{organization.memberCount - 3}
          </AvatarGroupCount>
        ) : null}
      </AvatarGroup>
      {showRole ? (
        <div className="mt-2">
          <OrganizationRoleBadge role={organization.role} />
        </div>
      ) : null}
    </div>
  </div>
)
