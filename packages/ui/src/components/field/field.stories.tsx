import { expect } from "storybook/test"

import preview from "#storybook/preview"

import { Input } from "../input/input"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "./field"

const invalidEmailErrors = [{ message: "Enter a valid .test email address." }]

const meta = preview.meta({
  title: "Components/Field",
  component: Field,
  tags: ["autodocs"],
})

export const AccountDetails = meta.story({
  render: () => (
    <FieldSet className="w-80">
      <FieldLegend>Account details</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="account-email">Email address</FieldLabel>
          <FieldDescription>
            Security notices are sent to this verified address.
          </FieldDescription>
          <Input
            id="account-email"
            type="email"
            defaultValue="avery@example.test"
            required
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("textbox", { name: "Email address" })
    ).toHaveValue("avery@example.test")
  },
})

export const Invalid = meta.story({
  render: () => (
    <Field data-invalid="true" className="w-80">
      <FieldContent>
        <FieldLabel htmlFor="invite-email">Invitee email</FieldLabel>
        <FieldTitle>New Acme Cloud member</FieldTitle>
      </FieldContent>
      <Input
        id="invite-email"
        aria-invalid="true"
        aria-describedby="invite-email-error"
        defaultValue="avery@example"
      />
      <FieldError id="invite-email-error" errors={invalidEmailErrors} />
    </Field>
  ),
})

export const Disabled = meta.story({
  render: () => (
    <Field data-disabled="true" className="w-80">
      <FieldLabel htmlFor="billing-plan">Billing plan</FieldLabel>
      <Input id="billing-plan" value="Enterprise" disabled readOnly />
      <FieldDescription>Contact an owner to change the plan.</FieldDescription>
    </Field>
  ),
})
