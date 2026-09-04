import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import type { InvitationContext } from "../../api"
import { InvitationDecisionPanel } from "./invitation-decision-panel"

const currentUser = {
  currentUserId: "user_01K1AVERY00000000000000",
  currentUserName: "Avery Stone",
  currentUserEmail: "avery@example.test",
  currentUserProfileImage: null,
} as const

const invitation = {
  id: "invitation_01K1PENDING00000000",
  organizationId: "org_01K1ACMECLOUD0000000000",
  organizationName: "Acme Cloud",
  organizationSlug: "acme",
  inviterEmail: "owner@example.test",
  role: "member",
  status: "pending",
  createdAt: "2026-07-24T00:00:00.000Z",
  expiresAt: "2026-08-01T00:00:00.000Z",
} satisfies InvitationContext

const meta = preview.meta({
  title: "Web/Members/Invitation Decision",
  component: InvitationDecisionPanel,
  tags: ["autodocs"],
  parameters: { disableGlobalToaster: true },
  decorators: [
    (Story) => (
      <Providers>
        <div className="mx-auto flex justify-center">
          <Story />
        </div>
      </Providers>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
  args: {
    ...currentUser,
    invitation,
    invitationId: invitation.id,
    state: "ready",
  },
  play: async ({ canvas, step }) => {
    await step("Tabキーで招待の拒否操作へフォーカスを移す", async () => {
      await userEvent.tab()
      await expect(canvas.getByRole("button", { name: "Reject" })).toHaveFocus()
    })
  },
})

export const SignedOut = meta.story({
  args: { invitationId: invitation.id, state: "signed_out" },
})

export const RecipientMismatch = meta.story({
  args: {
    ...currentUser,
    invitationId: invitation.id,
    state: "recipient_mismatch",
  },
})

export const Unavailable = meta.story({
  args: {
    ...currentUser,
    invitationId: invitation.id,
    state: "unavailable",
  },
})

export const LoadError = meta.story({
  args: {
    ...currentUser,
    invitationId: invitation.id,
    state: "load_error",
  },
})
