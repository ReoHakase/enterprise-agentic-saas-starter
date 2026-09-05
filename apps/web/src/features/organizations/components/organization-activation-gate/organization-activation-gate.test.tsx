import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OrganizationActivationGate } from "./organization-activation-gate"

const mocks = vi.hoisted(() => ({
  events: (() => {
    const events: string[] = []
    return events
  })(),
  activateOrganization: vi.fn<() => Promise<unknown>>(),
  beginOrganizationSwitch: vi.fn<() => Record<string, boolean>>(),
  cancelOrganizationSwitch: vi.fn<() => void>(),
  completeOrganizationSwitch: vi.fn<() => Promise<void>>(),
  prepareOrganizationSwitch: vi.fn<() => Promise<void>>(),
  routerInvalidate: vi.fn<() => void>(),
  showError: vi.fn<() => void>(),
}))

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn<() => void>() },
}))

vi.mock("@/features/agent", () => ({
  hasOrganizationSwitchRisks: () => false,
  useAgentRuntimeState: () => ({
    beginOrganizationSwitch: mocks.beginOrganizationSwitch,
    cancelOrganizationSwitch: mocks.cancelOrganizationSwitch,
    completeOrganizationSwitch: mocks.completeOrganizationSwitch,
  }),
}))

vi.mock("@/features/console", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/console")>()
  return {
    ...original,
    showConsoleApiErrorToast: mocks.showError,
  }
})

vi.mock("../../cache", () => ({
  prepareOrganizationSwitch: mocks.prepareOrganizationSwitch,
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: {
    activateOrganization: mocks.activateOrganization,
  },
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("OrganizationActivationGateの契約", () => {
  beforeEach(() => {
    mocks.events.length = 0
    vi.clearAllMocks()
    mocks.beginOrganizationSwitch.mockReturnValue({})
    mocks.completeOrganizationSwitch.mockImplementation(async () => {
      mocks.events.push("complete-local-agent-state")
    })
    mocks.prepareOrganizationSwitch.mockImplementation(async () => {
      mocks.events.push("cancel-and-prepare-tenant-cache")
    })
  })

  it("サーバー側の有効化成功までstream・upload・draftを保持する", async () => {
    const actor = userEvent.setup()
    let resolveActivation: ((value: unknown) => void) | undefined
    mocks.activateOrganization.mockImplementation(
      () =>
        new Promise((resolve) => {
          mocks.events.push("activate-server-context")
          resolveActivation = resolve
        })
    )
    render(
      <OrganizationActivationGate
        organizationId="org-target"
        organizationName="Target"
      />,
      { wrapper: createWrapper() }
    )

    await actor.click(
      screen.getByRole("button", { name: "Switch and continue" })
    )
    await waitFor(() =>
      expect(mocks.activateOrganization).toHaveBeenCalledWith("org-target")
    )
    expect(mocks.events).toEqual(["activate-server-context"])
    expect(mocks.completeOrganizationSwitch).not.toHaveBeenCalled()
    expect(mocks.prepareOrganizationSwitch).not.toHaveBeenCalled()

    const finishActivation = resolveActivation
    if (!finishActivation) throw new Error("Activation did not start")
    await act(async () => finishActivation({ organizationId: "org-target" }))

    await waitFor(() =>
      expect(mocks.prepareOrganizationSwitch).toHaveBeenCalledOnce()
    )
    expect(mocks.events).toEqual([
      "activate-server-context",
      "complete-local-agent-state",
      "cancel-and-prepare-tenant-cache",
    ])
  })

  it("サーバー側の有効化失敗時もローカル状態を保持する", async () => {
    const actor = userEvent.setup()
    mocks.activateOrganization.mockRejectedValue(new Error("unavailable"))
    render(
      <OrganizationActivationGate
        organizationId="org-target"
        organizationName="Target"
      />,
      { wrapper: createWrapper() }
    )

    await actor.click(
      screen.getByRole("button", { name: "Switch and continue" })
    )
    await waitFor(() =>
      expect(mocks.cancelOrganizationSwitch).toHaveBeenCalledOnce()
    )
    expect(mocks.completeOrganizationSwitch).not.toHaveBeenCalled()
    expect(mocks.prepareOrganizationSwitch).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledOnce()
  })
})
