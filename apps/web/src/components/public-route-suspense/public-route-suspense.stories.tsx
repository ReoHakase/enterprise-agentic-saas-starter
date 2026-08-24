import preview from "#storybook/preview"

import {
  AuthRouteLoading,
  InvitationRouteLoading,
  RootRouteLoading,
} from "./public-route-suspense"

const meta = preview.meta({
  title: "Web/Shared/Public Route Loading",
  component: AuthRouteLoading,
  tags: ["autodocs"],
})

export const Authentication = meta.story({
  tags: ["theme-sensitive"],
})

export const Invitation = meta.story({
  render: () => <InvitationRouteLoading />,
})

export const Root = meta.story({
  render: () => <RootRouteLoading />,
})
