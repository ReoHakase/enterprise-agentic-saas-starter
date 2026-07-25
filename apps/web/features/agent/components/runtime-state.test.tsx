import { FileUploadError } from "@enterprise-agentic-saas/api/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createStore, Provider as JotaiProvider } from "jotai"
import { useCallback, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  AgentRuntimeProvider,
  useAgentThreadRuntimeState,
} from "./runtime-state"
import { toAgentImageUploadError } from "./runtime-state-types"

const formRegistry = vi.hoisted(() => ({
  clear: vi.fn<() => void>(),
  hasDirtyForms: vi.fn<() => boolean>(() => false),
  setFrozen: vi.fn<(frozen: boolean) => void>(),
}))

vi.mock("./form-registry", () => ({
  useAgentFormRegistry: () => formRegistry,
}))

const SessionProbe = () => {
  const runtime = useAgentThreadRuntimeState("thread-1")
  const rememberSubmission = useCallback(
    () =>
      runtime.setPendingSubmission({
        id: "message-stable",
        fingerprint: "same-draft",
      }),
    [runtime]
  )
  return (
    <div>
      <output aria-label="Pending message ID">
        {runtime.pendingSubmission?.id ?? "none"}
      </output>
      <button type="button" onClick={rememberSubmission}>
        Remember submission
      </button>
    </div>
  )
}

const Harness = () => {
  const [mounted, setMounted] = useState(true)
  const toggleSession = useCallback(() => setMounted((current) => !current), [])
  return (
    <>
      <button type="button" onClick={toggleSession}>
        Toggle session
      </button>
      {mounted ? <SessionProbe /> : null}
    </>
  )
}

describe("AgentRuntimeProvider", () => {
  it("distinguishes disabled and unavailable image upload failures", () => {
    expect(
      toAgentImageUploadError(
        new FileUploadError({
          code: "feature_not_enabled",
          message: "Service temporarily unavailable",
          status: 503,
        })
      ).message
    ).toContain("disabled in this environment")
    expect(
      toAgentImageUploadError(
        new FileUploadError({ message: "Network error", status: 0 })
      ).message
    ).toContain("temporarily unavailable")
  })

  it("keeps a failed submission identity when the shell session unmounts", async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <JotaiProvider store={createStore()}>
        <QueryClientProvider client={queryClient}>
          <AgentRuntimeProvider userId="user-1" organizationId="org-1">
            <Harness />
          </AgentRuntimeProvider>
        </QueryClientProvider>
      </JotaiProvider>
    )

    await user.click(
      screen.getByRole("button", { name: "Remember submission" })
    )
    expect(screen.getByLabelText("Pending message ID")).toHaveTextContent(
      "message-stable"
    )

    await user.click(screen.getByRole("button", { name: "Toggle session" }))
    expect(
      screen.queryByLabelText("Pending message ID")
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Toggle session" }))

    expect(screen.getByLabelText("Pending message ID")).toHaveTextContent(
      "message-stable"
    )
  })
})
