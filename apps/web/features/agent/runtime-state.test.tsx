import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type PropsWithChildren,
} from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AgentFormRegistryProvider } from "./form-registry"
import {
  AgentRuntimeProvider,
  hasBlockingThreadSwitchRisks,
  useAgentRuntimeState,
  useAgentThreadRuntimeState,
} from "./runtime-state"

const mocks = vi.hoisted(() => ({
  uploadAgentAssetWithProgress: vi.fn<(options: unknown) => Promise<unknown>>(),
  deleteAgentAsset: vi.fn<(...input: unknown[]) => Promise<void>>(),
}))

vi.mock("@enterprise-agentic-saas/api/client", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadAgentAssetWithProgress: mocks.uploadAgentAssetWithProgress,
}))
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal()),
  deleteAgentAsset: mocks.deleteAgentAsset,
}))

const uploadedAsset = {
  id: "asset-1",
  filename: "screenshot.png",
  sizeBytes: 4,
  imageWidth: 2,
  imageHeight: 2,
  previewable: true as const,
  expiresAt: "2026-07-25T00:00:00.000Z",
}
const sessionLifecycle = {
  stop: vi.fn<() => void>(),
  close: vi.fn<() => void>(),
}
let latestUploadRequest: Promise<void> | undefined

const RuntimeHarness = ({
  threadId,
  session,
}: {
  threadId: string
  session?: { stop: () => void; close: () => void }
}) => {
  const runtime = useAgentRuntimeState()
  const threadRuntime = useAgentThreadRuntimeState(threadId)
  const registerSession = threadRuntime.registerSession
  const [risks, setRisks] = useState("")
  useEffect(
    () =>
      session
        ? registerSession({
            ...session,
            isBusy: () => true,
            hasPendingApprovals: () => true,
          })
        : undefined,
    [registerSession, session]
  )
  const changeComposer = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      threadRuntime.setComposer(event.target.value),
    [threadRuntime]
  )
  const attach = useCallback(() => {
    latestUploadRequest = threadRuntime.uploadImages([
      new File(["data"], "screenshot.png", { type: "image/png" }),
    ])
    void latestUploadRequest
  }, [threadRuntime])
  const leaveThread = useCallback(() => {
    runtime.beginThreadSwitch(threadId)
    void runtime
      .completeThreadSwitch(threadId, { discardDraft: false })
      .finally(runtime.cancelThreadSwitch)
  }, [runtime, threadId])
  const archiveThread = useCallback(() => {
    runtime.beginThreadSwitch(threadId)
    void runtime
      .completeThreadSwitch(threadId, { discardDraft: true })
      .finally(runtime.cancelThreadSwitch)
  }, [runtime, threadId])
  const inspectRisks = useCallback(() => {
    setRisks(JSON.stringify(runtime.beginThreadSwitch(threadId)))
  }, [runtime, threadId])
  const completeOrganizationSwitch = useCallback(() => {
    runtime.beginOrganizationSwitch()
    void runtime.completeOrganizationSwitch()
  }, [runtime])

  return (
    <div>
      <label>
        Composer
        <input value={threadRuntime.composer} onChange={changeComposer} />
      </label>
      <output aria-label="staged assets">
        {threadRuntime.stagedAssets.length}
      </output>
      <output aria-label="active uploads">
        {threadRuntime.uploadingCount}
      </output>
      <output aria-label="thread risks">{risks}</output>
      <button type="button" onClick={attach}>
        Attach
      </button>
      <button type="button" onClick={leaveThread}>
        Leave
      </button>
      <button type="button" onClick={archiveThread}>
        Archive
      </button>
      <button type="button" onClick={inspectRisks}>
        Inspect risks
      </button>
      <button type="button" onClick={completeOrganizationSwitch}>
        Complete organization switch
      </button>
    </div>
  )
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <AgentFormRegistryProvider>
        <AgentRuntimeProvider userId="user-1" organizationId="org-1">
          {children}
        </AgentRuntimeProvider>
      </AgentFormRegistryProvider>
    </QueryClientProvider>
  )
}

describe("Agent thread runtime state", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.uploadAgentAssetWithProgress.mockReset()
    mocks.deleteAgentAsset.mockReset().mockResolvedValue(undefined)
    sessionLifecycle.stop.mockReset()
    sessionLifecycle.close.mockReset()
    latestUploadRequest = undefined
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:asset-1")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
  })

  it("retains passive drafts but blocks hazardous thread switches", () => {
    expect(
      hasBlockingThreadSwitchRisks({
        composer: true,
        stagedAssets: true,
        uploads: false,
        activeTurn: false,
        pendingApprovals: false,
      })
    ).toBe(false)
    expect(
      hasBlockingThreadSwitchRisks({
        composer: false,
        stagedAssets: false,
        uploads: true,
        activeTurn: true,
        pendingApprovals: true,
      })
    ).toBe(true)
  })

  it("keeps composer and staged assets isolated by thread", async () => {
    const actor = userEvent.setup()
    mocks.uploadAgentAssetWithProgress.mockResolvedValue(uploadedAsset)
    const Wrapper = createWrapper()
    const view = render(<RuntimeHarness threadId="thread-a" />, {
      wrapper: Wrapper,
    })

    await actor.type(screen.getByLabelText("Composer"), "draft A")
    await actor.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() =>
      expect(screen.getByLabelText("staged assets")).toHaveTextContent("1")
    )

    view.rerender(<RuntimeHarness threadId="thread-b" />)
    expect(screen.getByLabelText("Composer")).toHaveValue("")
    expect(screen.getByLabelText("staged assets")).toHaveTextContent("0")

    view.rerender(<RuntimeHarness threadId="thread-a" />)
    expect(screen.getByLabelText("Composer")).toHaveValue("draft A")
    expect(screen.getByLabelText("staged assets")).toHaveTextContent("1")
  })

  it("deletes staged storage and revokes Blob URLs when archiving", async () => {
    const actor = userEvent.setup()
    mocks.uploadAgentAssetWithProgress.mockResolvedValue(uploadedAsset)
    render(<RuntimeHarness threadId="thread-a" />, {
      wrapper: createWrapper(),
    })

    await actor.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() =>
      expect(screen.getByLabelText("staged assets")).toHaveTextContent("1")
    )
    await actor.click(screen.getByRole("button", { name: "Archive" }))

    await waitFor(() =>
      expect(screen.getByLabelText("staged assets")).toHaveTextContent("0")
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:asset-1")
    expect(mocks.deleteAgentAsset).toHaveBeenCalledWith(expect.anything(), {
      organizationId: "org-1",
      assetId: "asset-1",
    })
  })

  it("drops local previews after an organization switch without cross-tenant DELETE", async () => {
    const actor = userEvent.setup()
    mocks.uploadAgentAssetWithProgress.mockResolvedValue(uploadedAsset)
    render(<RuntimeHarness threadId="thread-a" />, {
      wrapper: createWrapper(),
    })

    await actor.click(screen.getByRole("button", { name: "Attach" }))
    await waitFor(() =>
      expect(screen.getByLabelText("staged assets")).toHaveTextContent("1")
    )
    await actor.click(
      screen.getByRole("button", { name: "Complete organization switch" })
    )

    await waitFor(() =>
      expect(screen.getByLabelText("staged assets")).toHaveTextContent("0")
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:asset-1")
    expect(mocks.deleteAgentAsset).not.toHaveBeenCalled()
  })

  it("leaves a late organization or account switch upload response to server retention", async () => {
    const actor = userEvent.setup()
    let finishUpload: ((asset: typeof uploadedAsset) => void) | undefined
    mocks.uploadAgentAssetWithProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve
        })
    )
    render(<RuntimeHarness threadId="thread-a" />, {
      wrapper: createWrapper(),
    })

    await actor.click(screen.getByRole("button", { name: "Attach" }))
    expect(screen.getByLabelText("active uploads")).toHaveTextContent("1")
    await actor.click(
      screen.getByRole("button", { name: "Complete organization switch" })
    )
    expect(screen.getByLabelText("active uploads")).toHaveTextContent("0")

    const resolveUpload = finishUpload
    const request = latestUploadRequest
    if (!resolveUpload || !request) throw new Error("Upload did not start")
    await act(async () => {
      resolveUpload(uploadedAsset)
      await request
    })

    expect(screen.getByLabelText("staged assets")).toHaveTextContent("0")
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(mocks.deleteAgentAsset).not.toHaveBeenCalled()
  })

  it("fences an upload that completes after leaving its thread", async () => {
    const actor = userEvent.setup()
    let finishUpload: ((asset: typeof uploadedAsset) => void) | undefined
    mocks.uploadAgentAssetWithProgress.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve
        })
    )
    render(<RuntimeHarness threadId="thread-a" />, {
      wrapper: createWrapper(),
    })

    await actor.click(screen.getByRole("button", { name: "Attach" }))
    expect(screen.getByLabelText("active uploads")).toHaveTextContent("1")
    await actor.click(screen.getByRole("button", { name: "Leave" }))
    expect(screen.getByLabelText("active uploads")).toHaveTextContent("0")

    finishUpload?.(uploadedAsset)
    await waitFor(() =>
      expect(mocks.deleteAgentAsset).toHaveBeenCalledWith(expect.anything(), {
        organizationId: "org-1",
        assetId: "asset-1",
      })
    )
    expect(screen.getByLabelText("staged assets")).toHaveTextContent("0")
  })

  it("reports and stops an active run with a pending approval before leaving", async () => {
    const actor = userEvent.setup()
    render(<RuntimeHarness threadId="thread-a" session={sessionLifecycle} />, {
      wrapper: createWrapper(),
    })

    await actor.click(screen.getByRole("button", { name: "Inspect risks" }))
    expect(screen.getByLabelText("thread risks")).toHaveTextContent(
      '"activeTurn":true'
    )
    expect(screen.getByLabelText("thread risks")).toHaveTextContent(
      '"pendingApprovals":true'
    )

    await actor.click(screen.getByRole("button", { name: "Leave" }))
    expect(sessionLifecycle.stop).toHaveBeenCalledOnce()
    expect(sessionLifecycle.close).toHaveBeenCalledOnce()
  })
})
