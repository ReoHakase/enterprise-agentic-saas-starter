import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
} from "@tanstack/react-table"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"

import { DataTablePagination } from "./data-table-pagination"

const items = Array.from({ length: 45 }, (_, index) => ({
  id: `item-${index + 1}`,
}))
const columns = [{ accessorKey: "id", header: "Item" }]

const PaginationProbe = () => {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const table = useReactTable({
    data: items,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <>
      <output aria-label="Current page">{pagination.pageIndex + 1}</output>
      <output aria-label="Page size">{pagination.pageSize}</output>
      <DataTablePagination table={table} label="Members" />
    </>
  )
}

describe("DataTablePaginationの契約", () => {
  it("次のページへ進む", async () => {
    const user = userEvent.setup()
    render(<PaginationProbe />)

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByLabelText("Current page")).toHaveTextContent("2")
  })

  it("ページサイズ変更時に先頭ページへ戻す", async () => {
    const user = userEvent.setup()
    render(<PaginationProbe />)

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("combobox", { name: "Members per page" }))
    await user.click(await screen.findByRole("option", { name: "50 / page" }))
    expect(screen.getByLabelText("Current page")).toHaveTextContent("1")
    expect(screen.getByLabelText("Page size")).toHaveTextContent("50")
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()
  })
})
