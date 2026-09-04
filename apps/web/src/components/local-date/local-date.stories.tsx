import preview from "#storybook/preview"

import { LocalDate } from "./local-date"

const meta = preview.meta({
  title: "Web/Shared/Local Date",
  component: LocalDate,
  tags: ["autodocs"],
  args: { value: "2026-07-24T09:30:00.000Z", includeTime: true },
})

export const DateAndTime = meta.story({
  tags: ["theme-sensitive"],
})

export const Invalid = meta.story({
  args: { value: "not-a-date" },
})
