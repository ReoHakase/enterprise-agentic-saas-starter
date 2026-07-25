import { render, screen } from "@testing-library/react"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import { ConsoleRouteErrorBoundary } from "./client"

const captureException = vi.hoisted(() => vi.fn<(error: unknown) => void>())
const reset = vi.fn<() => void>()

vi.mock("@sentry/nextjs", () => ({
  captureException,
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/organization/acme/issues",
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
    // The route boundary receives the captured value from Next.js in production.
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

describe("ConsoleRouteErrorBoundary", () => {
  it("reports a thrown secret without exposing it to DOM or live regions", () => {
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
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: privateSentinel })
    )
  })
})
