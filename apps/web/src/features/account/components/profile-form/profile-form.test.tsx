import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { httpError } from "@/test-support/http-error"

import { ProfileForm } from "./profile-form"

const mocks = vi.hoisted(() => ({
  refresh: vi.fn<() => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  updateMe: vi.fn<(input: { name: string }) => Promise<unknown>>(),
}))

vi.mock("@/lib/browser/console-api", () => ({
  browserConsoleApi: { updateMe: mocks.updateMe },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess },
}))

const user = {
  id: "user-1",
  name: "Reo Hakase",
  email: "reo@example.test",
  profileImage: null,
}

const renderProfile = () => {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileForm user={user} />
    </QueryClientProvider>
  )
}

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateMe.mockResolvedValue(user)
  })

  it("updates the display name and refreshes the server view", async () => {
    const actor = userEvent.setup()
    mocks.updateMe.mockResolvedValue({ ...user, name: "Reo" })
    renderProfile()

    const name = screen.getByLabelText("Display name")
    await actor.clear(name)
    await actor.type(name, "Reo")
    await actor.click(screen.getByRole("button", { name: "Save profile" }))

    await waitFor(() => {
      expect(mocks.updateMe).toHaveBeenCalledOnce()
    })
    expect(mocks.updateMe.mock.calls[0]?.[0]).toEqual({ name: "Reo" })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile updated")
  })

  it("keeps input and displays the public field error", async () => {
    const actor = userEvent.setup()
    mocks.updateMe.mockRejectedValueOnce(
      httpError(400, "validation_error", {
        fieldErrors: { name: ["Choose another display name."] },
        message: "Check the highlighted fields.",
      })
    )
    renderProfile()

    const name = screen.getByLabelText("Display name")
    await actor.clear(name)
    await actor.type(name, "Draft name")
    await actor.click(screen.getByRole("button", { name: "Save profile" }))

    expect(
      await screen.findByText("Choose another display name.")
    ).toBeVisible()
    expect(name).toHaveValue("Draft name")
    expect(name).toHaveAttribute("aria-invalid", "true")

    await actor.type(name, " updated")

    expect(
      screen.queryByText("Choose another display name.")
    ).not.toBeInTheDocument()
    expect(name).toHaveAttribute("aria-invalid", "false")
  })

  it("keeps an unknown failure at form level without exposing its message", async () => {
    const actor = userEvent.setup()
    mocks.updateMe.mockRejectedValueOnce(
      new Error("libsql://secret-token@private.example.test")
    )
    renderProfile()

    const name = screen.getByLabelText("Display name")
    await actor.clear(name)
    await actor.type(name, "Safe draft")
    await actor.click(screen.getByRole("button", { name: "Save profile" }))

    expect(
      await screen.findByText("The profile was not saved.")
    ).toBeInTheDocument()
    expect(screen.queryByText(/secret-token/u)).not.toBeInTheDocument()
    expect(name).toHaveAttribute("aria-invalid", "false")
  })
})
