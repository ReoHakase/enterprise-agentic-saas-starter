import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MessageResponse } from "./message"

describe("MessageResponse", () => {
  it("portals the link safety dialog outside the Markdown paragraph", async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null)

    render(
      <MessageResponse>
        {"Read the [external docs](https://example.com/docs)."}
      </MessageResponse>
    )

    const linkButton = screen.getByRole("button", { name: "external docs" })
    const paragraph = screen.getByText(/^Read the/)

    await user.click(linkButton)

    const dialog = await screen.findByRole("alertdialog", {
      name: "Open external link?",
    })

    expect(document.body).toContainElement(dialog)
    expect(paragraph).not.toContainElement(dialog)

    await user.click(screen.getByRole("button", { name: "Open link" }))

    expect(openSpy).toHaveBeenCalledWith(
      "https://example.com/docs",
      "_blank",
      "noreferrer"
    )
    expect(
      screen.queryByRole("alertdialog", { name: "Open external link?" })
    ).not.toBeInTheDocument()
  })
})
