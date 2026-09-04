import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SidebarProvider, SidebarTrigger, useSidebar } from "./sidebar"

vi.mock("@enterprise-agentic-saas/ui/hooks/use-mobile", () => ({
  MOBILE_BREAKPOINT: 768,
  // モバイルのメディアクエリ判定が確定する前のhydration状態を再現する
  useIsMobile: () => false,
}))

const originalInnerWidth = window.innerWidth

function SidebarStateProbe() {
  const { open, openMobile } = useSidebar()

  return (
    <output>
      desktop:{String(open)} mobile:{String(openMobile)}
    </output>
  )
}

function renderSidebar() {
  render(
    <SidebarProvider>
      <SidebarTrigger />
      <SidebarStateProbe />
    </SidebarProvider>
  )
}

afterEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: originalInnerWidth,
  })
})

describe("SidebarProviderの契約", () => {
  it("検出が安定する前の最初のモバイル操作をドロワーへ送る", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    })
    const user = userEvent.setup()

    renderSidebar()
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))

    expect(screen.getByText("desktop:true mobile:true")).toBeInTheDocument()
  })

  it("デスクトップのインタラクションを永続的なサイドバーに維持する", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
    })
    const user = userEvent.setup()

    renderSidebar()
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }))

    expect(screen.getByText("desktop:false mobile:false")).toBeInTheDocument()
  })
})
