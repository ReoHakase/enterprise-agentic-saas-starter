import preview from "#storybook/preview"

import { AuthRouteFrame, InvitationRouteFrame } from "./public-route-frame"

const meta = preview.meta({
  title: "Web/Shared/Public Route Frames",
  component: AuthRouteFrame,
  tags: ["autodocs"],
})

export const Authentication = meta.story({
  tags: ["theme-sensitive"],
  args: {
    status: (
      <div role="status" className="rounded-xl border p-3">
        Security-sensitive reauthentication
      </div>
    ),
    children: (
      <div className="w-full rounded-2xl border bg-card p-5">
        Authentication form
      </div>
    ),
  },
})

export const Invitation = meta.story({
  render: () => (
    <InvitationRouteFrame>
      <div className="w-full max-w-lg rounded-2xl border p-5">
        Invitation decision
      </div>
    </InvitationRouteFrame>
  ),
})
