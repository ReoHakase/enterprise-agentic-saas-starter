import { useForm } from "@tanstack/react-form"
import { useCallback, type FormEvent } from "react"
import { expect, userEvent } from "storybook/test"
import * as v from "valibot"

import preview from "#storybook/preview"

import { FormTextField } from "./form-text-field"

const TextFieldExample = ({ serverErrors }: { serverErrors?: string[] }) => {
  const form = useForm({
    defaultValues: { title: "Prepare the release checklist" },
    validators: {
      onSubmit: v.object({
        title: v.pipe(v.string(), v.minLength(1, "Enter a title.")),
      }),
    },
  })
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )

  return (
    <form onSubmit={handleSubmit}>
      <form.Field name="title">
        {(field) => (
          <FormTextField
            description="Use a short, actionable title."
            field={field}
            id="story-title"
            label="Issue title"
            placeholder="What needs to happen?"
            serverErrors={serverErrors}
          />
        )}
      </form.Field>
      <button type="submit">Save title</button>
    </form>
  )
}

const meta = preview.meta({
  title: "Web/Shared/Form Text Field",
  component: TextFieldExample,
  tags: ["autodocs"],
})

export const Filled = meta.story({
  tags: ["theme-sensitive"],
  play: async ({ canvas, step }) => {
    await step("ARIAでローカル検証結果を公開する", async () => {
      const input = canvas.getByRole("textbox", { name: "Issue title" })
      await userEvent.clear(input)
      await userEvent.click(canvas.getByRole("button", { name: "Save title" }))
      await expect(input).toBeInvalid()
      await expect(canvas.getByText("Enter a title.")).toBeVisible()
    })
  },
})

export const ServerError = meta.story({
  args: { serverErrors: ["This title is already in use."] },
})
