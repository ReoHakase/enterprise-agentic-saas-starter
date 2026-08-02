import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import { useCallback } from "react"
import { describe, expect, it, vi } from "vitest"

import { useIssueSearchState } from "./search-params.client"
import {
  defaultIssueSearchState,
  toIssueListRequest,
} from "./search-params.shared"

let currentSearchParams = new URLSearchParams()
const { agentThread: _agentThread, ...tableDefaults } = defaultIssueSearchState

const Probe = () => {
  const { state, setDiscrete } = useIssueSearchState()
  const setPriorityRange = useCallback(
    () => void setDiscrete({ priorityFrom: "high", priorityTo: "urgent" }),
    [setDiscrete]
  )
  const resetQuery = useCallback(
    () => void setDiscrete(tableDefaults),
    [setDiscrete]
  )
  const clearSearch = useCallback(
    () => void setDiscrete({ q: "", page: 1 }),
    [setDiscrete]
  )
  return (
    <>
      <output aria-label="request">
        {JSON.stringify(toIssueListRequest("org-1", state))}
      </output>
      <button type="button" onClick={setPriorityRange}>
        Set priority range
      </button>
      <button type="button" onClick={resetQuery}>
        Reset query
      </button>
      <button type="button" onClick={clearSearch}>
        Clear search
      </button>
    </>
  )
}

describe("useIssueSearchState", () => {
  it("updates canonical priority range keys while preserving the Agent thread", async () => {
    const user = userEvent.setup()
    const updates: UrlUpdateEvent[] = []
    currentSearchParams = new URLSearchParams("agentThread=thread-x")
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>(
      (event: UrlUpdateEvent) => {
        updates.push(event)
        currentSearchParams = new URLSearchParams(event.searchParams)
      }
    )
    render(
      <NuqsTestingAdapter
        searchParams={currentSearchParams}
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <Probe />
      </NuqsTestingAdapter>
    )

    expect(screen.getByLabelText("request")).toHaveTextContent(
      '"organizationId":"org-1"'
    )
    expect(screen.getByLabelText("request")).not.toHaveTextContent(
      '"priorityFrom"'
    )

    await user.click(screen.getByRole("button", { name: "Set priority range" }))
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled())
    const changed = updates.at(-1)?.searchParams
    expect(changed?.get("priorityFrom")).toBe("high")
    expect(changed?.get("priorityTo")).toBeNull()
    expect(changed?.get("agentThread")).toBe("thread-x")
    await waitFor(() =>
      expect(screen.getByLabelText("request")).toHaveTextContent(
        '"priorityFrom":"high","priorityTo":"urgent"'
      )
    )

    await user.click(screen.getByRole("button", { name: "Reset query" }))
    await waitFor(() => expect(updates).toHaveLength(2))
    const reset = updates.at(-1)?.searchParams
    expect(reset?.get("priorityFrom")).toBeNull()
    expect(reset?.get("priorityTo")).toBeNull()
    expect(reset?.get("agentThread")).toBe("thread-x")
    await waitFor(() => {
      const request = JSON.parse(
        screen.getByLabelText("request").textContent ?? ""
      )
      expect(request.priorityFrom).toBeUndefined()
      expect(request.priorityTo).toBeUndefined()
    })
  })

  it("clears only search and page in one nuqs update", async () => {
    const user = userEvent.setup()
    const updates: UrlUpdateEvent[] = []
    currentSearchParams = new URLSearchParams(
      "q=billing&page=3&status=closed&sort=number&dir=asc&pageSize=50&agentThread=thread-x"
    )
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>((event) => {
      updates.push(event)
      currentSearchParams = new URLSearchParams(event.searchParams)
    })
    render(
      <NuqsTestingAdapter
        searchParams={currentSearchParams}
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <Probe />
      </NuqsTestingAdapter>
    )

    await user.click(screen.getByRole("button", { name: "Clear search" }))
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledOnce())
    const changed = updates[0]?.searchParams
    expect(changed?.get("q")).toBeNull()
    expect(changed?.get("page")).toBeNull()
    expect(changed?.get("status")).toBe("closed")
    expect(changed?.get("sort")).toBe("number")
    expect(changed?.get("dir")).toBe("asc")
    expect(changed?.get("pageSize")).toBe("50")
    expect(changed?.get("agentThread")).toBe("thread-x")
  })
})
