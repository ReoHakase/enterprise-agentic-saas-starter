import { act, renderHook } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { boundaryReloadFallbackMs } from "./boundary-retry-timing"
import { useBoundaryRetry } from "./use-boundary-retry"

const browser = vi.hoisted(() => ({ reload: vi.fn<() => void>() }))

const ErrorBoundaryWrapper = ({ children }: PropsWithChildren) => (
  <div data-boundary-state="error">{children}</div>
)

beforeEach(() => {
  vi.useFakeTimers()
  browser.reload.mockClear()
  vi.spyOn(window.location, "reload").mockImplementation(browser.reload)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useBoundaryRetry", () => {
  it("tries the mounted Next boundary before using the reload fallback", () => {
    const reset = vi.fn<() => void>()
    const { result } = renderHook(() => useBoundaryRetry(reset), {
      wrapper: ErrorBoundaryWrapper,
    })

    act(() => result.current())

    expect(reset).toHaveBeenCalledOnce()
    expect(browser.reload).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(boundaryReloadFallbackMs))

    expect(browser.reload).toHaveBeenCalledOnce()
  })

  it("cancels the reload when the error boundary recovers and unmounts", () => {
    const reset = vi.fn<() => void>()
    const { result, unmount } = renderHook(() => useBoundaryRetry(reset), {
      wrapper: ErrorBoundaryWrapper,
    })

    act(() => result.current())
    unmount()
    act(() => vi.advanceTimersByTime(boundaryReloadFallbackMs))

    expect(browser.reload).not.toHaveBeenCalled()
  })
})
