import type { Meta, StoryObj } from "@storybook/react-vite"
import { fn } from "storybook/test"

import { Providers } from "@/components/providers"

import { AccountSwitcherDialog } from "./account-switcher-dialog"
import { ProfileForm } from "./profile-form"
import { SecurityMethodsPanel } from "./security-methods-panel"
import { SessionsPanel } from "./sessions-panel"

const noop = fn()
const user = {
  id: "user-1",
  name: "Avery Stone",
  email: "avery@example.test",
  profileImage: null,
}

const AccountStoryFrame = ({ children }: { children: React.ReactNode }) => (
  <Providers>
    <div className="mx-auto grid w-full max-w-4xl gap-6">{children}</div>
  </Providers>
)

const meta = {
  title: "Web/Account/Component Catalogue",
  component: ProfileForm,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ProfileForm>

export default meta
type Story = StoryObj<typeof meta>

export const Profile: Story = {
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <ProfileForm user={user} />
    </AccountStoryFrame>
  ),
}

export const SessionsLoading: Story = {
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <SessionsPanel />
    </AccountStoryFrame>
  ),
}

export const SecurityMethodsLoading: Story = {
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <SecurityMethodsPanel />
    </AccountStoryFrame>
  ),
}

export const AccountSwitcherLoading: Story = {
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <AccountSwitcherDialog
        currentUser={user}
        open
        onOpenChange={noop}
        returnTo="/settings/account"
      />
    </AccountStoryFrame>
  ),
}
