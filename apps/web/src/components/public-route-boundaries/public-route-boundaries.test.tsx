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

describe("公開ルート境界", () => {
  it("読み込み状態に認証フレームを使う", () => {
    render(<AuthRouteLoading />)

    const frame = screen.getByRole("main")
    const status = screen.getByRole("status", {
      name: "Loading authentication",
    })

    expect(frame).toHaveAttribute("data-slot", "auth-frame")
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
    "%sの認証状態行を確保する",
    (search) => {
      navigation.search = search
      render(<AuthRouteLoading />)

      expect(
        screen.getByRole("status", { name: "Loading authentication" })
      ).toBeInTheDocument()
    }
  )

  it("認証フレームを維持して再試行する", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<AuthRouteError reset={reset} />)

    expect(screen.getByRole("main")).toHaveAttribute("data-slot", "auth-frame")
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-boundary-state",
      "error"
    )
    await actor.click(screen.getByRole("button", { name: "Try again" }))

    expect(reset).toHaveBeenCalledOnce()
    expect(browser.reload).not.toHaveBeenCalled()
  })

  it.each([
    ["add_account=1", "Add account"],
    ["reauth=1", "Security check"],
  ])("%sの認証エラー情報を保持する", (search, label) => {
    navigation.search = search
    render(<AuthRouteError reset={vi.fn<() => void>()} />)

    expect(screen.getByText(label)).toBeVisible()
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-boundary-state",
      "error"
    )
  })

  it("読み込み状態に招待フレームを使う", () => {
    render(<InvitationRouteLoading />)

    const frame = screen.getByRole("main")
    const status = screen.getByRole("status", {
      name: "Loading organization invitation",
    })

    expect(frame).toHaveAttribute("data-slot", "invitation-frame")
    expect(status).toHaveAttribute("data-slot", "invitation-panel")
    expect(status).toHaveAttribute("aria-busy", "true")
  })

  it("招待パネルで再試行アラートを表示する", async () => {
    const actor = userEvent.setup()
    const reset = vi.fn<() => void>()
    render(<InvitationRouteError reset={reset} />)

    const alert = screen.getByRole("alert")

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "invitation-frame"
    )
    expect(alert).toHaveAttribute("data-slot", "invitation-panel")
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
    "フレームを変えず%sのルート読み込み状態を表示する",
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
    "フレームを変えず%sのルートエラー状態を表示する",
    (pathname, heading, frameSlot) => {
      navigation.pathname = pathname
      render(<RootRouteError reset={vi.fn<() => void>()} />)

      expect(screen.getByRole("alert")).toContainElement(
        screen.getByRole("heading", { level: 1, name: heading })
      )
      expect(screen.getByRole("main")).toHaveAttribute("data-slot", frameSlot)
    }
  )
})
