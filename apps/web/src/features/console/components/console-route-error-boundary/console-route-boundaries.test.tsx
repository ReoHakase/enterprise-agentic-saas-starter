import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getConsoleErrorPresentation,
  getConsoleLoadingPresentation,
} from "../../route-presentations"
import { ConsoleShellSkeleton } from "../console-route-suspense/console-route-suspense"
import { ConsoleContentError, ConsoleShellError } from "./view"

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

describe("Consoleのルート境界", () => {
  it("読み込み中もサイドバーとヘッダーフレームを維持する", () => {
    render(<ConsoleShellSkeleton />)

    const status = screen.getByRole("status", {
      name: "Loading organization dashboard",
    })
    const header = screen.getByRole("banner")
    const frame = screen.getByRole("main")

    expect(frame).toHaveAttribute("data-slot", "sidebar-inset")
    expect(header).toBeInTheDocument()
    expect(status).toHaveAttribute("aria-busy", "true")
    expect(status).toHaveAttribute("data-slot", "page-shell")
    expect(status).toHaveAttribute("data-boundary-state", "loading")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("shellエラー時もConsoleフレームを維持して明示的に再試行する", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<ConsoleShellError reset={reset} />)

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "sidebar-inset"
    )
    expect(screen.getByRole("banner")).toBeInTheDocument()
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

  it("ネストしたルートエラーを既存コンテンツフレーム内だけに描画する", () => {
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

describe("getConsoleErrorPresentationの契約", () => {
  it.each([
    ["/dashboard", "Overview", true],
    ["/organization/acme/issues", "Issues", false],
    ["/settings/organizations", "Organizations", true],
    ["/settings/account", "Account settings", false],
    ["/organization/org-acme/members", "Members", false],
    ["/organization/org-acme/settings", "Organization settings", false],
  ] as const)(
    "%sをルートエラーヘッダーへ写像する",
    (pathname, title, showAction) => {
      expect(getConsoleErrorPresentation(pathname)).toMatchObject({
        title,
        showAction,
      })
    }
  )
})

describe("getConsoleLoadingPresentationの契約", () => {
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
      "/organization/acme/issues/1",
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
  ] as const)("%sを固定のルートSkeletonへ写像する", (pathname, expected) => {
    expect(getConsoleLoadingPresentation(pathname)).toEqual(expected)
  })
})
