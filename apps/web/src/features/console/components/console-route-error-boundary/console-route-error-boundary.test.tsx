import { render, screen } from "@testing-library/react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { ConsoleRouteErrorBoundary, ConsoleShellErrorBoundary } from "./client"

const reportObservedError = vi.hoisted(() => vi.fn<(error: unknown) => void>())
const reset = vi.fn<() => void>()

vi.mock("@/lib/report-observed-error", () => ({
  reportObservedError,
}))

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => unknown
  }) => select({ pathname: "/organization/acme/issues" }),
}))

const privateSentinel =
  "private-token=sentinel-secret&organization_id=org_private_123"

const SentinelThrower = () => {
  throw new Error(privateSentinel)
}

type BoundaryHarnessState = {
  error?: Error
}

class BoundaryHarness extends Component<
  { children: ReactNode },
  BoundaryHarnessState
> {
  state: BoundaryHarnessState = {}

  static getDerivedStateFromError(error: Error): BoundaryHarnessState {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // 本番ではTanStack Routerのroute boundaryがcapture済みの値を受け取る
  }

  render() {
    if (this.state.error) {
      return (
        <ConsoleRouteErrorBoundary error={this.state.error} reset={reset} />
      )
    }

    return this.props.children
  }
}

describe("ConsoleRouteErrorBoundaryの契約", () => {
  it("throwされた機密情報をDOMやlive regionへ公開せず報告する", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    render(
      <BoundaryHarness>
        <SentinelThrower />
      </BoundaryHarness>
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("The workspace is temporarily unavailable")
    expect(alert).not.toHaveTextContent(privateSentinel)
    expect(document.body).not.toHaveTextContent(privateSentinel)
    expect(reportObservedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: privateSentinel })
    )
  })

  it("親loaderの失敗を機密情報なしのConsole shell内で報告する", () => {
    render(
      <ConsoleShellErrorBoundary
        error={new Error(privateSentinel)}
        reset={reset}
      />
    )

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-slot",
      "sidebar-inset"
    )
    expect(screen.getByRole("alert")).not.toHaveTextContent(privateSentinel)
    expect(reportObservedError).toHaveBeenCalledWith(
      expect.objectContaining({ message: privateSentinel })
    )
  })
})
