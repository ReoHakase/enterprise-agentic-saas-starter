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
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Search, filter, and sort both tables", async () => {
      const membersTable = canvas.getByRole("table", {
        name: "Members of Acme Cloud",
      })
      const memberSearch = canvas.getByRole("searchbox", {
        name: "Search members by name or email",
      })
      await userEvent.type(memberSearch, "Jordan")
      await waitFor(() =>
        expect(
          within(membersTable).queryByText("Avery Stone")
        ).not.toBeInTheDocument()
      )
      await expect(within(membersTable).getByText("Jordan Lee")).toBeVisible()
      await userEvent.click(
        canvas.getByRole("button", { name: "Clear member search" })
      )
      await waitFor(() =>
        expect(within(membersTable).getByText("Avery Stone")).toBeVisible()
      )

      const memberSort = canvas.getByRole("combobox", {
        name: "Sort members by",
      })
      await userEvent.click(memberSort)
      await userEvent.click(await body.findByRole("option", { name: "Joined" }))
      const memberDirection = canvas.getByRole("combobox", {
        name: "Member sort direction",
      })
      await userEvent.click(memberDirection)
      await userEvent.click(
        await body.findByRole("option", { name: "Descending" })
      )
      await expect(
        canvas.getByRole("button", { name: "Reset member sort" })
      ).toBeEnabled()
      await userEvent.click(
        canvas.getByRole("button", { name: "Reset member sort" })
      )

      const invitationsTable = canvas.getByRole("table", {
        name: "Invitations for Acme Cloud",
      })
      const invitationSearch = canvas.getByRole("searchbox", {
        name: "Search invitations by recipient or inviter",
      })
      await userEvent.type(invitationSearch, "accepted")
      await waitFor(() =>
        expect(
          within(invitationsTable).queryByText("pending@example.test")
        ).not.toBeInTheDocument()
      )
      await expect(
        within(invitationsTable).getByText("accepted@example.test")
      ).toBeVisible()
      await userEvent.click(
        canvas.getByRole("button", { name: "Clear invitation search" })
      )

      const statusFilter = canvas.getByRole("combobox", {
        name: "Invitation status",
      })
      await userEvent.click(statusFilter)
      await userEvent.click(
        await body.findByRole("option", { name: "Pending" })
      )
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          within(invitationsTable).queryByText("accepted@example.test")
        ).not.toBeInTheDocument()
      )
      await expect(
        within(invitationsTable).getByText("pending@example.test")
      ).toBeVisible()
      await userEvent.click(
        canvas.getByRole("button", { name: "Reset invitation filters" })
      )
      await waitFor(() =>
        expect(
          within(invitationsTable).getByText("accepted@example.test")
        ).toBeVisible()
      )

      const memberFooter = canvas.getByLabelText("Members table footer")
      const invitationFooter = canvas.getByLabelText("Invitations table footer")
      await expect(
        within(memberFooter).getByRole("combobox", {
          name: "Members per page",
        })
      ).toBeVisible()
      await expect(
        within(invitationFooter).getByRole("combobox", {
          name: "Invitations per page",
        })
      ).toBeVisible()
      await expect(
        within(memberFooter).getByRole("button", { name: "Next" })
      ).toBeDisabled()
      await expect(
        within(invitationFooter).getByRole("button", { name: "Next" })
      ).toBeDisabled()
    })

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
        for (const roleName of ["Member", "Admin", "Owner"]) {
          const visibleOption = body
            .getAllByRole("option", { name: roleName })
            .find((option) => option.getBoundingClientRect().width > 0)
          expect(visibleOption).toBeVisible()
        }
      })
      await expect(
        within(roleTrigger).getByTestId("organization-role-owner")
      ).toBeVisible()
      await Promise.all(
        (
          [
            ["Member", "organization-role-member"],
            ["Admin", "organization-role-admin"],
            ["Owner", "organization-role-owner"],
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

    await step("Inspect invitation role and lifecycle badges", async () => {
      const table = canvas.getByRole("table", {
        name: "Invitations for Acme Cloud",
      })
      await Promise.all(
        (
          ["pending", "accepted", "rejected", "expired", "canceled"] as const
        ).map(async (status) => {
          await expect(
            within(table).getByTestId(`invitation-status-${status}`)
          ).toBeVisible()
        })
      )
      await expect(
        within(table).getAllByTestId(/^organization-role-/u)
      ).toHaveLength(fictionalInvitations.length)
    })

    await step("Open the invitation workflow and validate input", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Invite member" })
      )
      await waitFor(() =>
        expect(
          body.getByRole("dialog", { name: "Invite member" })
        ).toBeVisible()
      )
      await userEvent.type(
        body.getByRole("textbox", { name: "Email address" }),
        "not-an-email"
      )
      await userEvent.click(
        body.getByRole("button", { name: "Send invitation" })
      )
      await expect(body.getByText("Enter a valid email address.")).toBeVisible()
      await userEvent.click(body.getByRole("button", { name: "Cancel" }))
      await waitFor(() =>
        expect(
          body.queryByRole("dialog", { name: "Invite member" })
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
        canTransferOwnership: false,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("button", { name: "Invite member" })
    ).not.toBeInTheDocument()
  },
})

export const MobileTableOverflow = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: {
    initialInvitations: fictionalInvitations,
  },
  play: async ({ canvas, canvasElement }) => {
    const membersTable = canvas.getByRole("table", {
      name: "Members of Acme Cloud",
    })
    await expect(
      within(membersTable)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
    ).toEqual(["Member", "GitHub", "Passkey", "Joined", "Role", "Actions"])

    const membersScrollRegion = await canvas.findByRole("region", {
      name: "Members of Acme Cloud",
    })
    await expect(membersScrollRegion).toHaveAttribute(
      "data-horizontal-overflow",
      "true"
    )
    expect(membersScrollRegion.scrollWidth).toBeGreaterThan(
      membersScrollRegion.clientWidth
    )
    membersScrollRegion.scrollLeft = 40
    expect(membersScrollRegion.scrollLeft).toBeGreaterThan(0)
    const membersTableFrame = membersScrollRegion.parentElement
    if (!membersTableFrame) throw new Error("Expected members table frame")
    expect(membersTableFrame.scrollWidth).toBeLessThanOrEqual(
      membersTableFrame.clientWidth
    )

    const invitationsTable = canvas.getByRole("table", {
      name: "Invitations for Acme Cloud",
    })
    await expect(
      within(invitationsTable)
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
    ).toEqual([
      "Recipient",
      "Role",
      "Status",
      "Created",
      "Expires",
      "Inviter",
      "Actions",
    ])

    const invitationsScrollRegion = await canvas.findByRole("region", {
      name: "Invitations for Acme Cloud",
    })
    await expect(invitationsScrollRegion).toHaveAttribute(
      "data-horizontal-overflow",
      "true"
    )
    expect(invitationsScrollRegion.scrollWidth).toBeGreaterThan(
      invitationsScrollRegion.clientWidth
    )
    invitationsScrollRegion.scrollLeft = 40
    expect(invitationsScrollRegion.scrollLeft).toBeGreaterThan(0)
    const invitationsTableFrame = invitationsScrollRegion.parentElement
    if (!invitationsTableFrame)
      throw new Error("Expected invitations table frame")
    expect(invitationsTableFrame.scrollWidth).toBeLessThanOrEqual(
      invitationsTableFrame.clientWidth
    )

    expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  },
})
