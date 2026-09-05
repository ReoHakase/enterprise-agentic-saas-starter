import { createFileRoute, redirect } from "@tanstack/react-router"

const consoleSubroutes = new Set(["members", "settings"])

export const Route = createFileRoute(
  "/(public)/organization/invitations/$invitationId"
)({
  params: {
    parse: ({ invitationId }) =>
      consoleSubroutes.has(invitationId) ? false : { invitationId },
    stringify: ({ invitationId }) => ({ invitationId }),
  },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/invitations/$invitationId",
      params: { invitationId: params.invitationId },
      search: true,
      statusCode: 307,
    })
  },
})
