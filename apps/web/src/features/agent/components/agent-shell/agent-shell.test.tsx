import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createStore, Provider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AGENT_PANE_WIDTH_STORAGE_KEY,
  agentShellOpenAtom,
} from "../../shell-state"
import { AgentShell, AgentShellTrigger } from "./agent-shell"

const mockState = vi.hoisted(() => ({
  isMobile: false,
}))

vi.mock("@enterprise-agentic-saas/ui/hooks/use-mobile", () => ({
  useIsMobile: () => mockState.isMobile,
}))

vi.mock("../agent-dashboard/agent-dashboard", () => ({
  AgentDashboard: ({
    organizationId,
    organizationSlug,
    presentation,
    disabled,
  }: {
    organizationId: string
    organizationSlug: string
    presentation: string
    disabled: boolean
  }) => (
    <div
      data-testid="agent-dashboard"
      data-organization-id={organizationId}
      data-organization-slug={organizationSlug}
      data-presentation={presentation}
      data-disabled={disabled}
    />
  ),
}))

const acmeOrganization = {
  id: "org-1",
  slug: "acme",
  name: "Acme",
}
const betaOrganization = {
  id: "org-2",
  slug: "beta",
  name: "Beta",
}

const renderAgentShell = (
  store = createStore(),
  organization = acmeOrganization,
  contextMismatch = false
) => {
  const view = render(
    <Provider store={store}>
      <AgentShellTrigger />
      <AgentShell
        userId="user-1"
        organization={organization}
        contextMismatch={contextMismatch}
      />
    </Provider>
  )
  return { ...view, store }
}

describe("AgentShellの契約", () => {
  beforeEach(() => {
    mockState.isMobile = false
    window.localStorage.clear()
  })

  it("保存したデスクトップペイン幅を復元する", async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(AGENT_PANE_WIDTH_STORAGE_KEY, "480")
    renderAgentShell()

    await user.click(screen.getByRole("button", { name: "Open Agent" }))

    const separator = screen.getByRole("separator", {
      name: "Resize Agent pane",
    })
    expect(separator).toHaveAttribute("aria-valuenow", "480")
  })

  it("手動で開いたペインを再描画後も維持する", async () => {
    const user = userEvent.setup()
    const { rerender, store } = renderAgentShell()

    await user.click(screen.getByRole("button", { name: "Open Agent" }))
    rerender(
      <Provider store={store}>
        <AgentShellTrigger />
        <AgentShell
          userId="user-1"
          organization={acmeOrganization}
          contextMismatch={false}
        />
      </Provider>
    )
    expect(screen.getByRole("complementary", { name: "Agent" })).toBeVisible()
  })

  it("組織変更時に開いているペインを閉じる", async () => {
    const user = userEvent.setup()
    const { rerender, store } = renderAgentShell()

    await user.click(screen.getByRole("button", { name: "Open Agent" }))
    expect(screen.getByRole("complementary", { name: "Agent" })).toBeVisible()

    rerender(
      <Provider store={store}>
        <AgentShellTrigger />
        <AgentShell
          userId="user-1"
          organization={betaOrganization}
          contextMismatch={false}
        />
      </Provider>
    )

    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "Agent" })
      ).not.toBeInTheDocument()
    )
    expect(store.get(agentShellOpenAtom)).toBe(false)
  })

  it("利用者のscope変更時にペインを閉じる", async () => {
    const user = userEvent.setup()
    const { rerender, store } = renderAgentShell()

    await user.click(screen.getByRole("button", { name: "Open Agent" }))
    expect(screen.getByRole("complementary", { name: "Agent" })).toBeVisible()

    rerender(
      <Provider store={store}>
        <AgentShellTrigger />
        <AgentShell
          userId="user-2"
          organization={acmeOrganization}
          contextMismatch={false}
        />
      </Provider>
    )

    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "Agent" })
      ).not.toBeInTheDocument()
    )
    expect(store.get(agentShellOpenAtom)).toBe(false)
  })

  it("コンテキスト不一致時はAgent toolを無効にする", async () => {
    const user = userEvent.setup()
    renderAgentShell(createStore(), acmeOrganization, true)

    await user.click(screen.getByRole("button", { name: "Open Agent" }))

    expect(screen.getByRole("status")).toHaveTextContent(
      "Activate it before using the Agent or client tools."
    )
    expect(screen.getByTestId("agent-dashboard")).toHaveAttribute(
      "data-disabled",
      "true"
    )
  })
})
