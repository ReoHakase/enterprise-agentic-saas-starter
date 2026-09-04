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

describe("メンバーと招待テーブルの検索状態", () => {
  it("prefixなしのメンバーとinv prefixの招待検索語を読み分ける", () => {
    render(
      <NuqsTestingAdapter searchParams="q=alice&inv_q=bob">
        <Probe />
      </NuqsTestingAdapter>
    )

    expect(screen.getByLabelText("member search")).toHaveTextContent("alice")
    expect(screen.getByLabelText("invitation search")).toHaveTextContent("bob")
  })

  it.each([
    {
      caseLabel: "メンバーfilterを招待の名前空間から分離する",
      action: "Filter members",
      expected: { roles: "admin", inv_q: "bob" },
      absent: ["inv_roles"],
    },
    {
      caseLabel: "招待filterをメンバーの名前空間から分離する",
      action: "Filter invitations",
      expected: { inv_statuses: "pending", q: "alice" },
      absent: ["statuses"],
    },
    {
      caseLabel: "メンバーsortを招待の名前空間から分離する",
      action: "Sort members",
      expected: { sort: "role", dir: "desc", inv_q: "bob" },
      absent: ["inv_sort", "inv_dir"],
    },
    {
      caseLabel: "招待sortをメンバーの名前空間から分離する",
      action: "Sort invitations",
      expected: { inv_sort: "email", inv_dir: "asc", q: "alice" },
      absent: ["sort", "dir"],
    },
    {
      caseLabel: "メンバーpaginationを招待の名前空間から分離する",
      action: "Paginate members",
      expected: { page: "2", pageSize: "50", inv_q: "bob" },
      absent: ["inv_page", "inv_pageSize"],
    },
    {
      caseLabel: "招待paginationをメンバーの名前空間から分離する",
      action: "Paginate invitations",
      expected: { inv_page: "3", inv_pageSize: "100", q: "alice" },
      absent: ["page", "pageSize"],
    },
  ])("$caseLabel", async ({ action, absent, expected }) => {
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

    await user.click(screen.getByRole("button", { name: action }))
    await waitFor(() => expect(updates).toHaveLength(1))
    const searchParams = updates[0]?.searchParams
    for (const [key, value] of Object.entries(expected)) {
      expect(searchParams?.get(key)).toBe(value)
    }
    for (const key of absent) expect(searchParams?.get(key)).toBeNull()
  })
})
