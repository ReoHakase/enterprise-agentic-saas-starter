import { expect, fn, userEvent, waitFor } from "storybook/test"

import preview from "#storybook/preview"

import {
  AuthRouteError,
  InvitationRouteError,
  StandaloneRouteError,
} from "./public-route-error-boundary.client"

const reset = fn()

const meta = preview.meta({
  title: "Web/Shared/Public Route Errors",
  component: StandaloneRouteError,
  tags: ["autodocs"],
  args: { reset },
})

export const Standalone = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    reset.mockClear()
  },
  play: async ({ canvas, step }) => {
    await step("フォーカスをエラーから回復に移す", async () => {
      await waitFor(() =>
        expect(
          canvas.getByRole("heading", {
            name: "The application could not be loaded",
          })
        ).toHaveFocus()
      )
      await userEvent.tab()
      await expect(
        canvas.getByRole("button", { name: "Reload application" })
      ).toHaveFocus()
    })
  },
})

export const Authentication = meta.story({
  render: () => <AuthRouteError reset={reset} />,
  play: async ({ canvas, step }) => {
    await step("認証エラーを表示すると見出しへフォーカスを移す", async () => {
      await waitFor(() =>
        expect(
          canvas.getByRole("heading", {
            name: "Authentication could not be loaded",
          })
        ).toHaveFocus()
      )
    })
  },
})

export const Invitation = meta.story({
  render: () => <InvitationRouteError reset={reset} />,
  play: async ({ canvas, step }) => {
    await step("招待エラーを表示すると見出しへフォーカスを移す", async () => {
      await waitFor(() =>
        expect(
          canvas.getByRole("heading", {
            name: "Invitation could not be loaded",
          })
        ).toHaveFocus()
      )
    })
  },
})
