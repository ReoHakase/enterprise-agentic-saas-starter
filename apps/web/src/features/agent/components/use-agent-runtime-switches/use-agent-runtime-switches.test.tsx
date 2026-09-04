import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const formRegistry = {
  clear: vi.fn<() => void>(),
  hasDirtyForms: vi.fn<(organizationId: string) => boolean>(() => false),
  setFrozen: vi.fn<(frozen: boolean) => void>(),
}

vi.mock("../form-registry/form-registry", () => ({
  useAgentFormRegistry: () => formRegistry,
}))
vi.mock("../../api", () => ({
  deleteAgentAsset: vi.fn<() => Promise<void>>(),
}))

import { useAgentRuntimeSwitches } from "./use-agent-runtime-switches"

type RuntimeSwitchInput = Parameters<typeof useAgentRuntimeSwitches>[0]

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
)

const createInput = (): RuntimeSwitchInput => ({
  contextFenceRef: { current: 0 },
  draftsRef: { current: { scope: {} } },
  frozenRef: { current: false },
  organizationId: "organization_1",
  readThreadDraft: vi.fn<RuntimeSwitchInput["readThreadDraft"]>(() => ({
    composer: "",
    pendingSubmission: undefined,
    stagedAssets: [],
    uploadingCount: 0,
  })),
  removeCurrentScope: vi.fn<RuntimeSwitchInput["removeCurrentScope"]>(),
  removeThreadDraft: vi.fn<RuntimeSwitchInput["removeThreadDraft"]>(),
  scopeKey: "scope",
  setFrozen: vi.fn<RuntimeSwitchInput["setFrozen"]>(),
  stopThreadUploads: vi.fn<RuntimeSwitchInput["stopThreadUploads"]>(),
  uploadsRef: { current: new Map() },
})

describe("useAgentRuntimeSwitchesの契約", () => {
  beforeEach(() => vi.clearAllMocks())

  it("権威あるStopの完了を待ってからスレッドを切り替え、失敗時はセッションを保持する", async () => {
    let settleStop: ((settled: boolean) => void) | undefined
    const stop = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleStop = resolve
          })
      )
      .mockResolvedValueOnce(true)
    const close = vi.fn<() => void>()
    const input = createInput()
    const { result } = renderHook(() => useAgentRuntimeSwitches(input), {
      wrapper,
    })
    act(() => {
      result.current.registerSession("thread_1", {
        abortTransport: vi.fn<() => void>(),
        close,
        stop,
        isBusy: () => true,
        hasPendingApprovals: () => false,
      })
    })

    let transition: Promise<void> | undefined
    act(() => {
      transition = result.current.completeThreadSwitch("thread_1", {
        discardDraft: false,
      })
    })
    expect(close).not.toHaveBeenCalled()
    expect(input.stopThreadUploads).not.toHaveBeenCalled()
    await act(async () => {
      settleStop?.(false)
      await expect(transition).rejects.toThrow(
        "Agent run cancellation did not settle"
      )
    })
    expect(close).not.toHaveBeenCalled()

    await act(async () => {
      await expect(
        result.current.completeThreadSwitch("thread_1", {
          discardDraft: false,
        })
      ).resolves.toBeUndefined()
    })
    expect(stop).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledOnce()
    expect(input.stopThreadUploads).toHaveBeenCalledWith("thread_1")
  })

  it("Stopを呼び出さず組織切替ではサーバーコンテキストを取り消す", () => {
    const stop = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const abortTransport = vi.fn<() => void>()
    const close = vi.fn<() => void>()
    const input = createInput()
    const { result } = renderHook(() => useAgentRuntimeSwitches(input), {
      wrapper,
    })
    act(() => {
      result.current.registerSession("thread_1", {
        abortTransport,
        close,
        stop,
        isBusy: () => true,
        hasPendingApprovals: () => false,
      })
      result.current.abortOrganizationSwitch()
    })

    expect(stop).not.toHaveBeenCalled()
    expect(abortTransport).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(input.contextFenceRef.current).toBe(1)
  })

  it("通常の切替では保留中の承認をスレッドに残す", async () => {
    const stop = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const close = vi.fn<() => void>()
    const input = createInput()
    const { result } = renderHook(() => useAgentRuntimeSwitches(input), {
      wrapper,
    })
    act(() => {
      result.current.registerSession("thread_1", {
        abortTransport: vi.fn<() => void>(),
        close,
        stop,
        isBusy: () => false,
        hasPendingApprovals: () => true,
      })
    })

    await act(async () => {
      await result.current.completeThreadSwitch("thread_1", {
        discardDraft: false,
      })
    })

    expect(stop).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })

  it("ペインのアンマウントをStopへ変換しない", () => {
    const stop = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    const close = vi.fn<() => void>()
    const input = createInput()
    const { result, unmount } = renderHook(
      () => useAgentRuntimeSwitches(input),
      { wrapper }
    )
    act(() => {
      result.current.registerSession("thread_1", {
        abortTransport: vi.fn<() => void>(),
        close,
        stop,
        isBusy: () => true,
        hasPendingApprovals: () => false,
      })
    })
    unmount()

    expect(stop).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })
})
