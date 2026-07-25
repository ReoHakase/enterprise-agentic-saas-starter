import { TooltipProvider } from "@enterprise-agentic-saas/ui/components/tooltip"
import { Provider as JotaiProvider, createStore } from "jotai"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { useState } from "react"
import { fn } from "storybook/test"

import preview from "#storybook/preview"

import type { AgentChatMessage, AgentThread } from "../../schema"
import { agentShellOpenAtom } from "../../shell-state"
import { AgentApprovalAttachments } from "../agent-approval-attachments/agent-approval-attachments"
import { AgentApprovalCard } from "../agent-approval-card/agent-approval-card"
import {
  AgentComposer,
  type AgentMentionValue,
} from "../agent-composer/agent-composer"
import { AgentConversation } from "../agent-conversation/agent-conversation"
import { AgentDashboard } from "../agent-dashboard/agent-dashboard"
import { AgentMessage } from "../agent-message/agent-message"
import { AgentNewThreadComposer } from "../agent-new-thread-composer/agent-new-thread-composer"
import {
  AgentPermissionSelect,
  AgentPolicyControl,
} from "../agent-policy-control/agent-policy-control"
import { AgentShell, AgentShellTrigger } from "../agent-shell/agent-shell"
import { AgentShortcutHelp } from "../agent-shortcut-help/agent-shortcut-help"
import { AgentStagedAsset } from "../agent-staged-asset/agent-staged-asset"
import {
  AgentThreadItem,
  AgentThreadToolbar,
} from "../agent-thread-picker/agent-thread-picker"
import { AgentFormRegistryProvider } from "../form-registry/form-registry"
import {
  AgentRuntimeProvider,
  type StagedAgentAsset,
} from "../runtime-state/runtime-state"

const noop = fn()
const noopAsync = fn(async () => undefined)
const thread: AgentThread = {
  id: "thread-1",
  title: "Review tenant access",
  titleRevision: 1,
  status: "active",
  messageCount: 3,
  createdAt: "2026-07-24T09:00:00.000Z",
  updatedAt: "2026-07-24T09:30:00.000Z",
}
const threads = [thread]
const composerCandidates: AgentMentionValue[] = [
  {
    kind: "issue",
    id: "issue-1",
    label: "Issue #1: Review tenant access",
  },
]
const approvalAttachments = [
  {
    assetId: "asset-1",
    filename: "tenant-policy.png",
    sizeBytes: 2048,
  },
]
const assistantMessage: AgentChatMessage = {
  id: "message-1",
  role: "assistant",
  parts: [
    {
      type: "text",
      text: "Membership is checked again before every write.",
    },
  ],
}
const stagedAsset: StagedAgentAsset = {
  asset: {
    id: "asset-1",
    filename: "tenant-policy.png",
    sizeBytes: 2048,
    imageWidth: 640,
    imageHeight: 480,
    previewable: true,
    expiresAt: "2026-07-25T09:00:00.000Z",
  },
  file: new File(["preview"], "tenant-policy.png", {
    type: "image/png",
  }),
  blobUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23dbeafe'/%3E%3C/svg%3E",
}
const shellOrganization = { id: "org-1", slug: "acme", name: "Acme" }
const shellStore = createStore()
shellStore.set(agentShellOpenAtom, true)

const AgentProviderHarness = ({ children }: { children: React.ReactNode }) => (
  <NuqsAdapter>
    <JotaiProvider>
      <TooltipProvider>
        <AgentFormRegistryProvider>
          <AgentRuntimeProvider userId="user-1" organizationId="org-1">
            {children}
          </AgentRuntimeProvider>
        </AgentFormRegistryProvider>
      </TooltipProvider>
    </JotaiProvider>
  </NuqsAdapter>
)

const ComposerCatalogue = () => {
  const [draftText, setDraftText] = useState(
    "Summarize the current tenant policy."
  )
  const [permissionMode, setPermissionMode] = useState<
    "ask_always" | "full_access"
  >("ask_always")

  return (
    <div className="grid max-w-2xl gap-6">
      <AgentComposer
        candidates={composerCandidates}
        disabled={false}
        draftText={draftText}
        onDraftTextChange={setDraftText}
      />
      <AgentPermissionSelect
        mode={permissionMode}
        disabled={false}
        onModeChange={setPermissionMode}
      />
      <AgentNewThreadComposer
        organizationId="org-1"
        disabled={false}
        creating={false}
        onCreate={noop}
      />
    </div>
  )
}

const ApprovalCatalogue = () => (
  <div className="grid max-w-2xl gap-6">
    <AgentApprovalAttachments
      organizationId="org-1"
      attachments={approvalAttachments}
    />
    <AgentApprovalCard
      organizationId="org-1"
      organizationSlug="acme"
      actionId="action-loading"
      frozen={false}
      onPendingChange={noop}
    />
  </div>
)

const ConversationCatalogue = () => (
  <AgentProviderHarness>
    <div className="grid max-w-3xl gap-6">
      <AgentMessage
        message={assistantMessage}
        organizationId="org-1"
        organizationSlug="acme"
        frozen={false}
        onPendingChange={noop}
      />
      <AgentConversation
        organizationId="org-1"
        organizationSlug="acme"
        thread={thread}
        presentation="page"
        disabled={false}
        autoSubmit={false}
        onAutoSubmit={noop}
        onInitialComposerSnapshotConsumed={noop}
      />
    </div>
  </AgentProviderHarness>
)

const ThreadControlsCatalogue = () => (
  <div className="grid max-w-xl gap-4">
    <AgentThreadToolbar
      threads={threads}
      selectedThread={thread}
      loading={false}
      error={false}
      creating={false}
      archiving={false}
      renaming={false}
      disabled={false}
      onSelect={noop}
      onCreate={noop}
      onArchive={noop}
      onRename={noop}
    />
    <AgentThreadItem
      thread={thread}
      selected
      disabled={false}
      onSelect={noop}
      onArchive={noop}
    />
    <AgentStagedAsset
      item={stagedAsset}
      disabled={false}
      onRemove={noopAsync}
    />
  </div>
)

const RuntimeCatalogue = () => (
  <AgentFormRegistryProvider>
    <AgentRuntimeProvider userId="user-1" organizationId="org-1">
      <p>Agent runtime is scoped to the active organization.</p>
    </AgentRuntimeProvider>
  </AgentFormRegistryProvider>
)

const ShellCatalogue = () => (
  <NuqsAdapter>
    <JotaiProvider store={shellStore}>
      <TooltipProvider>
        <AgentFormRegistryProvider>
          <AgentRuntimeProvider userId="user-1" organizationId="org-1">
            <div className="flex min-h-152">
              <AgentShellTrigger />
              <AgentShell
                userId="user-1"
                organization={shellOrganization}
                contextMismatch
              />
            </div>
          </AgentRuntimeProvider>
        </AgentFormRegistryProvider>
      </TooltipProvider>
    </JotaiProvider>
  </NuqsAdapter>
)

const meta = preview.meta({
  title: "Web/Agent/Component Catalogue",
  component: ComposerCatalogue,
  parameters: { layout: "fullscreen" },
})

export const ComposerAndPermission = meta.story({
  render: () => (
    <AgentProviderHarness>
      <ComposerCatalogue />
    </AgentProviderHarness>
  ),
})

export const ApprovalLoadingAndAttachments = meta.story({
  render: () => <ApprovalCatalogue />,
})

export const ConversationLoadingAndMessage = meta.story({
  render: () => <ConversationCatalogue />,
})

export const ThreadControls = meta.story({
  render: () => <ThreadControlsCatalogue />,
})

export const PermissionPolicyLoading = meta.story({
  render: () => (
    <AgentPolicyControl
      organizationId="org-1"
      threadId="thread-1"
      disabled={false}
    />
  ),
})

export const DashboardLoading = meta.story({
  render: () => (
    <AgentProviderHarness>
      <AgentDashboard
        organizationId="org-1"
        organizationSlug="acme"
        presentation="page"
      />
    </AgentProviderHarness>
  ),
})

export const ShortcutReference = meta.story({
  render: () => <AgentShortcutHelp open onOpenChange={noop} />,
})

export const RuntimeScope = meta.story({
  render: () => <RuntimeCatalogue />,
})

export const PersistentShell = meta.story({
  render: () => <ShellCatalogue />,
})
