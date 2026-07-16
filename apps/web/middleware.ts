import { NextResponse, type NextRequest } from "next/server"

import { getLegacyInvitationRedirectPath } from "@/lib/auth/invitation-path"

export const middleware = (request: NextRequest) => {
  const redirectPath = getLegacyInvitationRedirectPath(request.nextUrl.pathname)
  if (!redirectPath) return NextResponse.next()

  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = redirectPath
  return NextResponse.redirect(redirectUrl, 307)
}

export const config = {
  matcher: ["/organization/invitations/:path"],
}
