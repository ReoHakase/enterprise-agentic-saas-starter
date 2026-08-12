import { PageShell } from "@/components/page-shell/page-shell"
import {
  ProfileForm,
  SecurityMethodsPanel,
  SessionsPanel,
} from "@/features/account"
import { McpOAuthSessionsPanel } from "@/features/mcp-oauth"
import { getConsoleContext } from "@/lib/server/console-context"

export default async function AccountSettingsPage() {
  const { me } = await getConsoleContext()

  return (
    <PageShell
      title="Account settings"
      description="Manage your profile, signed-in devices, and MCP access from one place."
    >
      <div className="grid min-w-0 gap-6">
        <ProfileForm user={me.user} />
        <SecurityMethodsPanel />
        <SessionsPanel />
        <McpOAuthSessionsPanel />
      </div>
    </PageShell>
  )
}
