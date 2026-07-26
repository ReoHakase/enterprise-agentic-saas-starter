import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Calendar, CalendarDayButton } from "./calendar"

const july2026 = new Date(2026, 6, 1)
const selectedDate = new Date(2026, 6, 24)
const calendarComponents = { DayButton: CalendarDayButton }
const selectDate = fn()

const meta = preview.meta({
  title: "Components/Calendar",
  component: Calendar,
  tags: ["autodocs"],
  args: {
    components: calendarComponents,
    defaultMonth: july2026,
    mode: "single",
    onSelect: selectDate,
    selected: selectedDate,
  },
})

export const SelectedDate = meta.story({
  play: async ({ canvas, step }) => {
    await step("Choose a date with the keyboard", async () => {
      const selected = canvas.getByRole("button", { name: /Friday, July 24/ })
      selected.focus()
      await userEvent.keyboard("{ArrowRight}{Enter}")
      await expect(selectDate).toHaveBeenCalled()
    })
  },
})

export const Required = meta.story({
  render: () => (
    <Calendar
      components={calendarComponents}
      defaultMonth={july2026}
      mode="single"
      onSelect={fn()}
      required
      selected={selectedDate}
    />
  ),
})

export const DisabledWeekends = meta.story({
  args: {
    disabled: { dayOfWeek: [0, 6] },
  },
})
