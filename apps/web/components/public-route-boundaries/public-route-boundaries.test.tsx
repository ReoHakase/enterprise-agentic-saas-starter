import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  AuthRouteError,
  InvitationRouteError,
  RootRouteError,
} from "../public-route-error-boundary.client/public-route-error-boundary.client"
import {
  AuthRouteLoading,
  InvitationRouteLoading,
  RootRouteLoading,
} from "../public-route-suspense/public-route-suspense"

const navigation = vi.hoisted(() => ({
  pathname: "/auth/sign-in",
  search: "",
}))
const browser = vi.hoisted(() => ({ reload: vi.fn<() => void>() }))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}))

beforeEach(() => {
  navigation.pathname = "/auth/sign-in"
  navigation.search = ""
  browser.reload.mockClear()
  vi.spyOn(window.location, "reload").mockImplementation(browser.reload)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("public route boundaries", () => {
  it("uses the authentication frame for its loading state", () => {
    render(<AuthRouteLoading />)

    const frame = screen.getByRole("main")
    const status = screen.getByRole("status", {
      name: "Loading authentication",
    })

    expect(frame).toHaveAttribute("data-slot", "auth-frame")
    expect(frame).toHaveClass("min-h-svh", "bg-muted", "p-6", "md:p-10")
    expect(
      screen.getByRole("link", { name: "Enterprise SaaS" })
    ).toHaveAttribute("href", "/")
    expect(
      screen.getByText(/By continuing, you agree to the workspace terms/)
    ).toBeInTheDocument()
    expect(status).toHaveAttribute("aria-busy", "true")
    expect(status).toHaveAttribute("data-boundary-state", "loading")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it.each(["add_account=1", "reauth=1"])(
    "reserves the authentication status row for %s",
    (search) => {
      navigation.search = search
      render(<AuthRouteLoading />)

      expect(screen.getByRole("main")).toContainHTML("px-4 py-3")
      expect(
        screen.getByRole("status", { name: "Loading authentication" })
      ).toBeInTheDocument()
    }
  )

  it("keeps the authentication frame and exposes a focused retry alert", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<AuthRouteError reset={reset} />)

    expect(screen.getByRole("main")).toHaveAttribute("data-slot", "auth-frame")
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-boundary-state",
      "error"
    )
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Authentication could not be loaded",
      })
    ).toHaveFocus()

    await actor.click(screen.getByRole("button", { name: "Try again" }))

    expect(reset).toHaveBeenCalledOnce()
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it.each([
    ["add_account=1", "Add account"],
    ["reauth=1", "Security check"],
  ])("keeps the authentication error context for %s", (search, label) => {
    navigation.search = search
    render(<AuthRouteError reset={vi.fn<() => void>()} />)

    expect(screen.getByText(label)).toBeVisible()
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-boundary-state",
      "error"
    )
  })

  it("uses the centered invitation frame for its loading state", () => {
    render(<InvitationRouteLoading />)

    const frame = screen.getByRole("main")
    const status = screen.getByRole("status", {
      name: "Loading organization invitation",
    })

    expect(frame).toHaveAttribute("data-slot", "invitation-frame")
    expect(frame).toHaveClass(
      "min-h-svh",
      "items-center",
      "justify-center",
      "p-6"
    )
    expect(status).toHaveAttribute("data-slot", "invitation-panel")
    expect(status).toHaveClass("w-full", "max-w-lg", "p-5")
    expect(status).toHaveAttribute("aria-busy", "true")
  })

  it("keeps the invitation panel dimensions and exposes a retry alert", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<InvitationRouteError reset={reset} />)

    const alert = screen.getByRole("alert")

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "invitation-frame"
    )
    expect(alert).toHaveAttribute("data-slot", "invitation-panel")
    expect(alert).toHaveClass("w-full", "max-w-lg", "p-5")
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Invitation could not be loaded",
      })
    ).toHaveFocus()

    await actor.click(screen.getByRole("button", { name: "Try again" }))

    expect(reset).toHaveBeenCalledOnce()
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it.each([
    ["/auth/sign-up", "Loading authentication", "auth-frame"],
    [
      "/invitations/invitation-1",
      "Loading organization invitation",
      "invitation-frame",
    ],
    ["/dashboard", "Loading organization dashboard", "sidebar-inset"],
  ] as const)(
    "routes the root loading state for %s without changing its frame",
    (pathname, accessibleName, frameSlot) => {
      navigation.pathname = pathname
      render(<RootRouteLoading />)

      expect(
        screen.getByRole("status", { name: accessibleName })
      ).toBeInTheDocument()
      expect(screen.getByRole("main")).toHaveAttribute("data-slot", frameSlot)
    }
  )

  it.each([
    ["/auth/sign-in", "Authentication could not be loaded", "auth-frame"],
    [
      "/invitations/invitation-1",
      "Invitation could not be loaded",
      "invitation-frame",
    ],
    ["/dashboard", "Overview", "sidebar-inset"],
  ] as const)(
    "routes the root error state for %s without changing its frame",
    async (pathname, heading, frameSlot) => {
      const actor = userEvent.setup()
      const reset = vi.fn<() => void>()
      navigation.pathname = pathname
      render(<RootRouteError reset={reset} />)

      expect(screen.getByRole("alert")).toContainElement(
        screen.getByRole("heading", { level: 1, name: heading })
      )
      expect(screen.getByRole("main")).toHaveAttribute("data-slot", frameSlot)

      await actor.click(screen.getByRole("button", { name: "Try again" }))

      expect(reset).toHaveBeenCalledOnce()
      expect(browser.reload).not.toHaveBeenCalled()
    }
  )
})
