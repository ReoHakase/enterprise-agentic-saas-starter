import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useEffect, useState } from "react"
import { describe, expect, it } from "vitest"

import { ConsoleContentError } from "@/components/console-route-error-boundary.client"

import { DashboardRouteSkeleton } from "./console-route-skeletons"

type RouteState = "error" | "loading" | "ready"

const RouteStateHarness = () => {
  const [state, setState] = useState<RouteState>("loading")
  const retry = useCallback(() => setState("loading"), [])
  const showError = useCallback(() => setState("error"), [])

  useEffect(() => {
    if (state !== "loading") return
    const timeout = window.setTimeout(() => setState("ready"), 20)
    return () => window.clearTimeout(timeout)
  }, [state])

  if (state === "loading") {
    return <DashboardRouteSkeleton />
  }

  if (state === "error") {
    return <ConsoleContentError reset={retry} />
  }

  return (
    <section
      aria-label="Overview ready"
      data-slot="page-shell"
      data-boundary-state="ready"
      className="flex w-full max-w-full min-w-0 flex-col gap-6 xl:max-w-7xl"
    >
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Button onClick={showError}>Trigger route error</Button>
    </section>
  )
}

describe("route state transitions", () => {
  it("preserves shell geometry, focuses errors, and retries in one browser run", async () => {
    const actor = userEvent.setup()
    render(<RouteStateHarness />)

    const loading = screen.getByRole("status", {
      name: "Loading organization dashboard",
    })
    const loadingWidth = loading.getBoundingClientRect().width
    await screen.findByRole("button", { name: "Trigger route error" })

    const ready = screen.getByRole("region", { name: "Overview ready" })
    expect(ready).toHaveAttribute("data-slot", "page-shell")
    await actor.click(
      screen.getByRole("button", { name: "Trigger route error" })
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveAttribute("data-slot", "page-shell")
    expect(
      screen.getByRole("heading", { level: 1, name: "Overview" })
    ).toHaveFocus()
    expect(loadingWidth).toBeGreaterThan(0)
    expect(alert.getBoundingClientRect().width).toBe(loadingWidth)

    await actor.click(screen.getByRole("button", { name: "Try again" }))
    await screen.findByRole("button", { name: "Trigger route error" })
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth
    )
  })
})
