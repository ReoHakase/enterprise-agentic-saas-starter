import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing"
import { useCallback } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  useInvitationTableSearchState,
  useMemberTableSearchState,
} from "./table-search-params"

const Probe = () => {
  const members = useMemberTableSearchState()
  const invitations = useInvitationTableSearchState()
  const filterMembers = useCallback(
    () => void members.setDiscrete({ roles: ["admin"] }),
    [members]
  )
  const filterInvitations = useCallback(
    () => void invitations.setDiscrete({ statuses: ["pending"] }),
    [invitations]
  )
  const sortMembers = useCallback(
    () => void members.setDiscrete({ sort: "role", dir: "desc" }),
    [members]
  )
  const sortInvitations = useCallback(
    () => void invitations.setDiscrete({ sort: "email", dir: "asc" }),
    [invitations]
  )
  const paginateMembers = useCallback(
    () => void members.setDiscrete({ page: 2, pageSize: "50" }),
    [members]
  )
  const paginateInvitations = useCallback(
    () => void invitations.setDiscrete({ page: 3, pageSize: "100" }),
    [invitations]
  )

  return (
    <>
      <output aria-label="member search">{members.state.q}</output>
      <output aria-label="invitation search">{invitations.state.q}</output>
      <button type="button" onClick={filterMembers}>
        Filter members
      </button>
      <button type="button" onClick={filterInvitations}>
        Filter invitations
      </button>
      <button type="button" onClick={sortMembers}>
        Sort members
      </button>
      <button type="button" onClick={sortInvitations}>
        Sort invitations
      </button>
      <button type="button" onClick={paginateMembers}>
        Paginate members
      </button>
      <button type="button" onClick={paginateInvitations}>
        Paginate invitations
      </button>
    </>
  )
}

describe("member and invitation table search state", () => {
  it("keeps the unprefixed member and inv-prefixed invitation namespaces isolated", async () => {
    const user = userEvent.setup()
    const updates: UrlUpdateEvent[] = []
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>((event) => {
      updates.push(event)
    })

    render(
      <NuqsTestingAdapter
        searchParams="q=alice&inv_q=bob"
        hasMemory
        onUrlUpdate={onUrlUpdate}
      >
        <Probe />
      </NuqsTestingAdapter>
    )

    expect(screen.getByLabelText("member search")).toHaveTextContent("alice")
    expect(screen.getByLabelText("invitation search")).toHaveTextContent("bob")

    await user.click(screen.getByRole("button", { name: "Filter members" }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]?.searchParams.get("roles")).toBe("admin")
    expect(updates[0]?.searchParams.get("inv_q")).toBe("bob")
    expect(updates[0]?.searchParams.get("inv_roles")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Filter invitations" }))
    await waitFor(() => expect(updates).toHaveLength(2))
    const finalSearchParams = updates[1]?.searchParams
    expect(finalSearchParams?.get("roles")).toBe("admin")
    expect(finalSearchParams?.get("inv_statuses")).toBe("pending")
    expect(finalSearchParams?.get("q")).toBe("alice")

    await user.click(screen.getByRole("button", { name: "Sort members" }))
    await waitFor(() => expect(updates).toHaveLength(3))
    expect(updates[2]?.searchParams.get("sort")).toBe("role")
    expect(updates[2]?.searchParams.get("dir")).toBe("desc")
    expect(updates[2]?.searchParams.get("inv_sort")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Sort invitations" }))
    await waitFor(() => expect(updates).toHaveLength(4))
    const sortedSearchParams = updates[3]?.searchParams
    expect(sortedSearchParams?.get("sort")).toBe("role")
    expect(sortedSearchParams?.get("dir")).toBe("desc")
    expect(sortedSearchParams?.get("inv_sort")).toBe("email")
    expect(sortedSearchParams?.get("inv_dir")).toBe("asc")

    await user.click(screen.getByRole("button", { name: "Paginate members" }))
    await waitFor(() => expect(updates).toHaveLength(5))
    expect(updates[4]?.searchParams.get("page")).toBe("2")
    expect(updates[4]?.searchParams.get("pageSize")).toBe("50")
    expect(updates[4]?.searchParams.get("inv_page")).toBeNull()

    await user.click(
      screen.getByRole("button", { name: "Paginate invitations" })
    )
    await waitFor(() => expect(updates).toHaveLength(6))
    const paginatedSearchParams = updates[5]?.searchParams
    expect(paginatedSearchParams?.get("page")).toBe("2")
    expect(paginatedSearchParams?.get("pageSize")).toBe("50")
    expect(paginatedSearchParams?.get("inv_page")).toBe("3")
    expect(paginatedSearchParams?.get("inv_pageSize")).toBe("100")
  })
})
