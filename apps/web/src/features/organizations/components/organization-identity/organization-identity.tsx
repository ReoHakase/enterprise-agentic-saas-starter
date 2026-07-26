import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { Building2Icon } from "lucide-react"

import { clientEnv } from "@/lib/env.client"
import { getSafeProfileImageUrl } from "@/lib/profile-image-url"

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
