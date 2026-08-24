import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Table, TableBody, TableCell, TableRow } from "./table"

let notifyResize: (() => void) | undefined

class ResizeObserverStub implements ResizeObserver {
  readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    notifyResize = () => callback([], this)
  }

  disconnect() {}
  observe() {}
  unobserve() {}
}

afterEach(() => {
  notifyResize = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("Tableの契約", () => {
  it("コンテンツがあふれた場合だけ名前付きscroll領域を追加する", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
    let overflowing = true
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      () => (overflowing ? 321 : 320)
    )
    render(
      <Table scrollLabel="Organization issues">
        <TableBody>
          <TableRow>
            <TableCell>Review tenant audit log</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    act(() => notifyResize?.())

    const region = screen.getByRole("region", {
      name: "Organization issues",
    })
    expect(region).toHaveAttribute("tabindex", "0")

    overflowing = false
    act(() => notifyResize?.())

    expect(
      screen.queryByRole("region", { name: "Organization issues" })
    ).not.toBeInTheDocument()
    expect(region).not.toHaveAttribute("tabindex")
  })
})
