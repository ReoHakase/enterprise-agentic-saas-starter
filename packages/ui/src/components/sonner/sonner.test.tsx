import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { toast } from "sonner"
import { describe, expect, it, vi } from "vitest"

import { Toaster } from "./sonner"

describe("Toaster", () => {
  it("keeps the toast surface transparent while actions remain interactive", async () => {
    const onAction = vi.fn<() => void>()
    const user = userEvent.setup()
    render(<Toaster />)

    act(() => {
      toast.error("Verify your email before signing in.", {
        action: { label: "Resend", onClick: onAction },
        testId: "verification-toast",
      })
    })

    const action = await screen.findByRole("button", { name: "Resend" })
    const toastElement = screen.getByTestId("verification-toast")
    expect(toastElement).toHaveClass("pointer-events-none")
    expect(action).toHaveClass("pointer-events-auto")

    await user.click(action)
    expect(onAction).toHaveBeenCalledOnce()
  })
})
