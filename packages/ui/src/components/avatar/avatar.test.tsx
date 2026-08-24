import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Avatar, AvatarFallback } from "./avatar"

describe("Avatarの契約", () => {
  it("デフォルトで円形を使用する", () => {
    render(
      <Avatar aria-label="User avatar">
        <AvatarFallback>RH</AvatarFallback>
      </Avatar>
    )

    expect(screen.getByLabelText("User avatar")).toHaveAttribute(
      "data-shape",
      "circle"
    )
  })

  it("丸みを帯びた正方形の形状をサポートする", () => {
    render(
      <Avatar aria-label="Organization avatar" shape="rounded">
        <AvatarFallback>AC</AvatarFallback>
      </Avatar>
    )

    expect(screen.getByLabelText("Organization avatar")).toHaveAttribute(
      "data-shape",
      "rounded"
    )
  })
})
