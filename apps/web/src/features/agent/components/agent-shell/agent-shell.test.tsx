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
  pathname: "/organization/acme/issues",
}))

vi.mock("@enterprise-agentic-saas/ui/hooks/use-mobile", () => ({
  useIsMobile: () => mockState.isMobile,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mockState.pathname,
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

describe("AgentShell", () => {
  beforeEach(() => {
    mockState.isMobile = false
    mockState.pathname = "/organization/acme/issues"
    window.localStorage.clear()
  })

  it("opens a persistent desktop pane and persists bounded keyboard resizing", async () => {
    const user = userEvent.setup()
    const { rerender, store } = renderAgentShell()

    expect(
      screen.queryByRole("complementary", { name: "Agent" })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open Agent" }))

    const pane = screen.getByRole("complementary", { name: "Agent" })
    const separator = screen.getByRole("separator", {
      name: "Resize Agent pane",
    })
    expect(pane).toHaveStyle({ width: "460px" })
    expect(separator).toHaveAttribute("aria-valuemin", "360")
    expect(separator).toHaveAttribute("aria-valuemax", "720")

    await user.tab()
    expect(separator).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(pane).toHaveStyle({ width: "480px" })
    expect(separator).toHaveAttribute("aria-valuenow", "480")
    expect(window.localStorage.getItem(AGENT_PANE_WIDTH_STORAGE_KEY)).toBe(
      "480"
    )

    mockState.pathname = "/organization/acme/members"
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
    expect(screen.getByRole("complementary", { name: "Agent" })).toHaveStyle({
      width: "480px",
    })
  })

  it("opens from the focused Agent route and closes when the tenant changes", async () => {
    mockState.pathname = "/organization/acme/agent"
    const { rerender, store } = renderAgentShell()

    expect(
      await screen.findByRole("complementary", { name: "Agent" })
    ).toBeInTheDocument()

    mockState.pathname = "/organization/beta/issues"
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

  it("uses a full-screen mobile sheet and disables tools on context mismatch", async () => {
    mockState.isMobile = true
    const user = userEvent.setup()
    renderAgentShell(createStore(), acmeOrganization, true)

    await user.click(screen.getByRole("button", { name: "Open Agent" }))

    const sheet = screen.getByRole("dialog", { name: "Agent" })
    expect(sheet).toHaveClass("inset-0", "size-full", "max-w-none")
    expect(screen.getByRole("status")).toHaveTextContent(
      "Activate it before using the Agent or client tools."
    )
    expect(screen.getByTestId("agent-dashboard")).toHaveAttribute(
      "data-disabled",
      "true"
    )

    await user.click(screen.getByRole("button", { name: "Close Agent" }))
    await waitFor(() => expect(sheet).not.toBeInTheDocument())
  })
})
