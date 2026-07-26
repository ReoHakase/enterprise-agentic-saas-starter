import { expect } from "storybook/test"

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
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", { name: "Loading authentication" })
    ).toHaveAttribute("aria-busy", "true")
  },
})

export const Invitation = meta.story({
  render: () => <InvitationRouteLoading />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", {
        name: "Loading organization invitation",
      })
    ).toBeVisible()
  },
})

export const Root = meta.story({
  render: () => <RootRouteLoading />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toBeInTheDocument()
  },
})
