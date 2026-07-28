import {
  Avatar,
  AvatarFallback,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  DataTableFacetedFilter,
  type DataTableFilterOption,
} from "./data-table-faceted-filter"

type MemberMeta = { initials: string }
const noValues: string[] = []
const memberOptions: DataTableFilterOption<string, MemberMeta>[] = [
  {
    value: "avery",
    label: "Avery",
    pinnedBadge: "You",
    meta: { initials: "AV" },
  },
  {
    value: "jordan",
    label: "Jordan",
    keywords: ["jordan@example.test"],
    meta: { initials: "JL" },
  },
]
const labelOptions: DataTableFilterOption<string>[] = [
  { value: "bug", label: "bug" },
  { value: "security", label: "security" },
]
const selectedLabels = ["bug", "security"]
const customLabelSummary = <span>bug +1</span>

const renderMember = (
  option: DataTableFilterOption<string, MemberMeta>,
  pinnedBadge?: string
) => (
  <span
    className="flex items-center gap-2"
    aria-label={`${option.label}${pinnedBadge ? ` ${pinnedBadge}` : ""}`}
  >
    <Avatar>
      <AvatarFallback>{option.meta?.initials}</AvatarFallback>
    </Avatar>
    <span>{option.label}</span>
    {pinnedBadge ? <Badge>{pinnedBadge}</Badge> : null}
  </span>
)

describe("DataTableFacetedFilter", () => {
  it("keeps only caller-pinned options above filtered regular options", async () => {
    const user = userEvent.setup()
    const onValuesChange = vi.fn<(values: string[]) => void>()
    render(
      <DataTableFacetedFilter
        label="Assignee"
        searchable
        values={noValues}
        onValuesChange={onValuesChange}
        renderOption={renderMember}
        options={memberOptions}
      />
    )

    await user.click(screen.getByRole("button", { name: "Assignee" }))
    const filter = await screen.findByRole("dialog", {
      name: "Assignee filter",
    })
    expect(within(filter).getByLabelText("Avery You")).toHaveTextContent(
      "AveryYou"
    )

    await user.type(
      within(filter).getByRole("combobox", { name: "Search assignee" }),
      "missing"
    )
    expect(within(filter).getByText("Avery")).toBeVisible()
    expect(within(filter).queryByText("Jordan")).not.toBeInTheDocument()
  })

  it("does not invent a pinned section for ordinary label options", async () => {
    const user = userEvent.setup()
    const onValuesChange = vi.fn<(values: string[]) => void>()
    render(
      <DataTableFacetedFilter
        label="Labels"
        searchable
        values={noValues}
        onValuesChange={onValuesChange}
        options={labelOptions}
      />
    )

    await user.click(screen.getByRole("button", { name: "Labels" }))
    const filter = await screen.findByRole("dialog", {
      name: "Labels filter",
    })
    await user.type(
      within(filter).getByRole("combobox", { name: "Search labels" }),
      "missing"
    )
    expect(within(filter).getByText("No options found.")).toBeVisible()
    expect(within(filter).queryByText("bug")).not.toBeInTheDocument()
  })

  it("renders a caller summary for active values instead of the default count", () => {
    render(
      <DataTableFacetedFilter
        label="Labels"
        searchable
        values={selectedLabels}
        onValuesChange={vi.fn<(values: string[]) => void>()}
        options={labelOptions}
        summary={customLabelSummary}
        summaryLabel="Selected labels: bug, security; 2 total"
      />
    )

    const trigger = screen.getByRole("button", { name: "Labels" })
    expect(trigger).toHaveAccessibleDescription(
      "Selected labels: bug, security; 2 total"
    )
    expect(within(trigger).getByText("bug +1")).toBeVisible()
    expect(within(trigger).queryByText("2")).not.toBeInTheDocument()
  })
})
