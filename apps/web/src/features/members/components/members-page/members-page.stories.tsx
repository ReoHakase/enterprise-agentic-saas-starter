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

    await step("Inspect linked login methods and role badges", async () => {
      const table = canvas.getByRole("table", { name: "Members of Acme Cloud" })
      await expect(
        within(table)
          .getAllByRole("columnheader")
          .map((header) => header.textContent?.trim())
      ).toEqual(["Member", "GitHub", "Passkey", "Joined", "Role", "Actions"])
      await expect(
        within(table).getByRole("img", {
          name: "Avery Stone has GitHub linked",
        })
      ).toBeVisible()
      await expect(
        within(table).getByRole("img", {
          name: "Avery Stone has a passkey linked",
        })
      ).toBeVisible()
      await expect(
        within(table).queryByRole("img", {
          name: "Jordan Lee has a passkey linked",
        })
      ).not.toBeInTheDocument()

      const roleTrigger = within(table).getByRole("combobox", {
        name: "Role for Avery Stone",
      })
      roleTrigger.focus()
      await userEvent.keyboard("{Enter}")
      await waitFor(() => {
        for (const roleName of ["Member", "Admin", "Super Admin"]) {
          const visibleOption = body
            .getAllByRole("option", { name: roleName })
            .find((option) => option.getBoundingClientRect().width > 0)
          expect(visibleOption).toBeVisible()
        }
      })
      await expect(
        within(roleTrigger).getByTestId("member-role-super_admin")
      ).toBeVisible()
      await Promise.all(
        (
          [
            ["Member", "member-role-member"],
            ["Admin", "member-role-admin"],
            ["Super Admin", "member-role-super_admin"],
          ] as const
        ).map(async ([roleName, testId]) => {
          const visibleOption = body
            .getAllByRole("option", { name: roleName })
            .find((option) => option.getBoundingClientRect().width > 0)
          if (!visibleOption)
            throw new Error(`Expected ${roleName} role option`)
          await expect(within(visibleOption).getByTestId(testId)).toBeVisible()
        })
      )
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(roleTrigger).toHaveFocus())

      await userEvent.click(
        within(table).getByRole("button", {
          name: "More actions for Jordan Lee",
        })
      )
      await waitFor(() => {
        const removeItem = body
          .getAllByRole("menuitem", { name: "Remove member" })
          .find((item) => getComputedStyle(item).pointerEvents !== "none")
        expect(removeItem).toBeVisible()
      })
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          within(table).getByRole("button", {
            name: "More actions for Jordan Lee",
          })
        ).toHaveFocus()
      )
    })

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

export const MobileTableOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    organization: {
      ...fictionalMemberOrganization,
      permissions: {
        ...fictionalMemberOrganization.permissions,
        canInviteMembers: false,
      },
    },
    initialInvitations: [],
  },
  play: async ({ canvas, canvasElement }) => {
    const table = canvas.getByRole("table", { name: "Members of Acme Cloud" })
    await expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
    ).toEqual(["Member", "GitHub", "Passkey", "Joined", "Role", "Actions"])

    const scrollRegion = await canvas.findByRole("region", {
      name: "Members of Acme Cloud",
    })
    await expect(scrollRegion).toHaveAttribute(
      "data-horizontal-overflow",
      "true"
    )
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth)
    scrollRegion.scrollLeft = 40
    expect(scrollRegion.scrollLeft).toBeGreaterThan(0)

    const tableFrame = scrollRegion.parentElement
    if (!tableFrame) throw new Error("Expected members table frame")
    expect(tableFrame.scrollWidth).toBeLessThanOrEqual(tableFrame.clientWidth)
    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  },
})
