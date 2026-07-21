import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Avatar, AvatarFallback } from "./avatar"

describe("Avatar", () => {
  it("uses a circular shape by default", () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback>RH</AvatarFallback>
      </Avatar>
    )

    expect(screen.getByTestId("avatar")).toHaveAttribute("data-shape", "circle")
  })

  it("supports a rounded square shape", () => {
    render(
      <Avatar data-testid="avatar" shape="rounded">
        <AvatarFallback data-testid="fallback">AC</AvatarFallback>
      </Avatar>
    )

    expect(screen.getByTestId("avatar")).toHaveAttribute(
      "data-shape",
      "rounded"
    )
    expect(screen.getByTestId("avatar")).toHaveClass(
      "data-[shape=rounded]:rounded-[22%]"
    )
    expect(screen.getByTestId("fallback")).toHaveClass("rounded-[inherit]")
  })
})
