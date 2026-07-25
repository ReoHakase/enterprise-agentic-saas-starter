import { fn } from "storybook/test"

import preview from "#storybook/preview"
import { Providers } from "@/components/providers/providers"

import { AccountSwitcherDialog } from "../account-switcher-dialog/account-switcher-dialog"
import { ProfileForm } from "../profile-form/profile-form"
import { SecurityMethodsPanel } from "../security-methods-panel/security-methods-panel"
import { SessionsPanel } from "../sessions-panel/sessions-panel"

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

const meta = preview.meta({
  title: "Web/Account/Component Catalogue",
  component: ProfileForm,
  parameters: { layout: "fullscreen" },
})

export const Profile = meta.story({
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <ProfileForm user={user} />
    </AccountStoryFrame>
  ),
})

export const SessionsLoading = meta.story({
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <SessionsPanel />
    </AccountStoryFrame>
  ),
})

export const SecurityMethodsLoading = meta.story({
  args: { user },
  render: () => (
    <AccountStoryFrame>
      <SecurityMethodsPanel />
    </AccountStoryFrame>
  ),
})

export const AccountSwitcherLoading = meta.story({
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
})
