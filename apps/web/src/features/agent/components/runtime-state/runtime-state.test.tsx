import { FileUploadError } from "@enterprise-agentic-saas/api/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createStore, Provider as JotaiProvider } from "jotai"
import { useCallback, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { getAgentImageUploadErrorText } from "../runtime-state-types/runtime-state-types"
import {
  AgentRuntimeProvider,
  useAgentThreadRuntimeState,
} from "./runtime-state"

const formRegistry = vi.hoisted(() => ({
  clear: vi.fn<() => void>(),
  hasDirtyForms: vi.fn<() => boolean>(() => false),
  setFrozen: vi.fn<(frozen: boolean) => void>(),
}))

vi.mock("../form-registry/form-registry", () => ({
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

describe("AgentRuntimeProviderの契約", () => {
  it("画像uploadが無効な場合は環境設定を案内する", () => {
    expect(
      getAgentImageUploadErrorText(
        new FileUploadError({
          code: "feature_not_enabled",
          message: "Service temporarily unavailable",
          status: 503,
        })
      )
    ).toContain("disabled in this environment")
  })

  it("画像uploadが利用不能な場合は再試行を案内する", () => {
    expect(
      getAgentImageUploadErrorText(
        new FileUploadError({ message: "Network error", status: 0 })
      )
    ).toContain("temporarily unavailable")
  })

  it("安全な画像uploadの4xx理由を保持する", () => {
    expect(
      getAgentImageUploadErrorText(
        new FileUploadError({
          message: "Choose an image smaller than 10 MB.",
          status: 400,
        })
      )
    ).toBe("Choose an image smaller than 10 MB.")
  })

  it("未知の画像uploadエラーでは生の詳細を公開しない", () => {
    expect(
      getAgentImageUploadErrorText(
        new Error("DATABASE_URL=file:private-upload.db")
      )
    ).toBe("Image upload failed.")
  })

  it("shell sessionのアンマウント時も失敗した送信IDを保持する", async () => {
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
