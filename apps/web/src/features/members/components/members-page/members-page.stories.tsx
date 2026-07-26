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
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Open the invitation workflow and validate input", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Invite members" })
      )
      await waitFor(() =>
        expect(
          body.getByRole("dialog", { name: "Invite members" })
        ).toBeVisible()
      )
      await userEvent.type(
        body.getByRole("textbox", { name: "Email addresses" }),
        "not-an-email"
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitations" })
      )
      await expect(
        body.getByText(
          "Enter valid email addresses separated by commas or new lines."
        )
      ).toBeVisible()
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(
          body.queryByRole("dialog", { name: "Invite members" })
        ).not.toBeInTheDocument()
      )
    })
  },
})

export const Empty = meta.story({
  args: {
    initialMembers: [],
    initialInvitations: [],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("0 people can access this workspace.")
    ).toBeVisible()
  },
})

export const InvitationsError = meta.story({
  beforeEach({ msw }) {
    msw.use(
      http.get("*/organizations/:organizationId/invitations", () =>
        HttpResponse.json(
          {
            error: {
              code: "invitations_unavailable",
              message: "Invitations unavailable.",
            },
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
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Invitations could not be loaded.")
    ).toBeVisible()
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
        canTransferSuperAdmin: false,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Invite members" })
    ).not.toBeInTheDocument()
  },
})
