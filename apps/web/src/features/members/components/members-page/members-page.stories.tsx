import { http, HttpResponse } from "msw"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import {
  fictionalInvitations,
  fictionalMemberOrganization,
  fictionalMembers,
} from "../../test-support/fixtures"
import { MembersPage } from "./members-page"
import { MembersPageStoryFixture } from "./test-support/members-page-story-fixture"

const meta = preview.meta({
  title: "Web/Members/Members Page",
  component: MembersPage,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto max-w-6xl">
          <Story />
        </div>
      </Providers>
    ),
  ],
  args: {
    organization: fictionalMemberOrganization,
    initialMembers: fictionalMembers,
    initialInvitations: fictionalInvitations,
  },
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const RoleMenuKeyboard = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("権限menuをキーボードで閉じるとトリガーへ戻る", async () => {
      const body = within(canvasElement.ownerDocument.body)
      const roleTrigger = within(
        canvas.getByRole("table", { name: "Members of Acme Cloud" })
      ).getByRole("combobox", { name: "Role for Avery Stone" })

      roleTrigger.focus()
      await userEvent.keyboard("{Enter}")
      await expect(await body.findByRole("listbox")).toBeVisible()
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(roleTrigger).toHaveFocus())
    })
  },
})

export const MemberActionsMenu = meta.story({
  play: async ({ canvas, canvasElement, step }) => {
    await step("メンバー操作menuを閉じるとトリガーへ戻る", async () => {
      const body = within(canvasElement.ownerDocument.body)
      const trigger = within(
        canvas.getByRole("table", { name: "Members of Acme Cloud" })
      ).getByRole("button", { name: "More actions for Jordan Lee" })

      await userEvent.click(trigger)
      const menu = await body.findByRole("menu")
      await waitFor(() => expect(menu).toHaveFocus())
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(trigger).toHaveFocus())
    })
  },
})

export const Empty = meta.story({
  args: {
    initialMembers: [],
    initialInvitations: [],
  },
})

export const InvitationsError = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/organizations/:organizationId/invitations", () =>
        HttpResponse.json(
          {
            error: "validation_error",
            message: "Invitations unavailable.",
          },
          { status: 400 }
        )
      )
    )
  },
  args: {
    initialInvitations: undefined,
    initialInvitationsError: "Invitations could not be loaded.",
  },
})

export const PermissionLimited = meta.story({
  args: {
    organization: {
      ...fictionalMemberOrganization,
      role: "member",
      permissions: {
        canEditOrganization: false,
        canInviteMembers: false,
        canManageMembers: false,
        canManageAdmins: false,
        canTransferOwnership: false,
      },
    },
  },
})

export const MobileTableOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <MembersPageStoryFixture />,
})
