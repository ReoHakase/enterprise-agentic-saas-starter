import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ConsoleContentError,
  ConsoleShellError,
  ConsoleShellSkeleton,
  getConsoleErrorPresentation,
  getConsoleLoadingPresentation,
} from "./console-boundary"

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}))

const browser = vi.hoisted(() => ({ reload: vi.fn<() => void>() }))

beforeEach(() => {
  browser.reload.mockClear()
  vi.spyOn(window.location, "reload").mockImplementation(browser.reload)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("console route boundaries", () => {
  it("keeps the sidebar and header frame while loading", () => {
    render(<ConsoleShellSkeleton />)

    const status = screen.getByRole("status", {
      name: "Loading organization dashboard",
    })
    const header = screen.getByRole("banner")
    const frame = screen.getByRole("main")

    expect(frame).toHaveAttribute("data-slot", "sidebar-inset")
    expect(frame).toHaveClass("h-svh", "min-w-0", "overflow-hidden")
    expect(header).toHaveClass("h-14", "px-4")
    expect(status).toHaveAttribute("aria-busy", "true")
    expect(status).toHaveAttribute("data-slot", "page-shell")
    expect(status).toHaveAttribute("data-boundary-state", "loading")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("keeps the console frame on a shell error and retries explicitly", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<ConsoleShellError reset={reset} />)

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "sidebar-inset"
    )
    expect(screen.getByRole("banner")).toHaveClass("h-14", "px-4")
    expect(screen.getByRole("alert")).toContainElement(
      screen.getByRole("heading", {
        level: 1,
        name: "Overview",
      })
    )

    await actor.click(screen.getByRole("button", { name: "Try again" }))

    expect(reset).toHaveBeenCalledOnce()
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it("renders a nested route error inside the existing content frame only", () => {
    const reset = vi.fn<() => void>()
    render(<ConsoleContentError reset={reset} />)

    expect(screen.queryByRole("main")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveAttribute("data-slot", "page-shell")
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-boundary-state",
      "error"
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Overview"
    )
  })
})

describe("getConsoleErrorPresentation", () => {
  it.each([
    ["/dashboard", "Overview", true],
    ["/dashboard/todos", "Issues", false],
    ["/settings/organizations", "Organizations", true],
    ["/settings/account", "Account settings", false],
    ["/organization/org-acme/members", "Members", false],
    ["/organization/org-acme/settings", "Organization settings", false],
  ] as const)(
    "maps %s to a geometry-compatible error header",
    (pathname, title, showAction) => {
      expect(getConsoleErrorPresentation(pathname)).toMatchObject({
        title,
        showAction,
      })
    }
  )
})

describe("getConsoleLoadingPresentation", () => {
  it.each([
    [
      "/dashboard",
      {
        label: "Loading organization dashboard",
        showAction: true,
        variant: "dashboard",
      },
    ],
    [
      "/dashboard/todos/issue-1",
      {
        label: "Loading organization issues",
        showAction: false,
        variant: "issues",
      },
    ],
    [
      "/settings/organizations",
      {
        label: "Loading organizations",
        showAction: true,
        variant: "table",
      },
    ],
    [
      "/organization/org-acme/members",
      {
        label: "Loading organization members",
        showAction: false,
        variant: "members",
      },
    ],
    [
      "/organization/org-acme/settings",
      {
        label: "Loading organization settings",
        showAction: false,
        variant: "organization-settings",
      },
    ],
  ] as const)("maps %s to its stable route skeleton", (pathname, expected) => {
    expect(getConsoleLoadingPresentation(pathname)).toEqual(expected)
  })
})
