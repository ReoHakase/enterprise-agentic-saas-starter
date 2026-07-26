import { type FormEvent, useCallback } from "react"
import { expect, fn, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Button } from "./button/button"
import { Checkbox } from "./checkbox/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./field/field"
import { Input } from "./input/input"
import { Label } from "./label/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select/select"

type Invitation = {
  email: string
  role: string
  securityUpdates: boolean
}

const roleItems = {
  administrator: "Administrator",
  member: "Member",
  viewer: "Viewer",
}

const InvitationForm = ({
  onInvite,
}: {
  onInvite: (invitation: Invitation) => void
}) => {
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      onInvite({
        email: String(data.get("email")),
        role: String(data.get("role")),
        securityUpdates: data.get("securityUpdates") === "on",
      })
    },
    [onInvite]
  )

  return (
    <form
      className="w-[min(28rem,calc(100vw-2rem))] rounded-3xl border p-6"
      onSubmit={submit}
    >
      <FieldSet>
        <FieldLegend>Invite an Acme Cloud member</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="workflow-email">Email address</FieldLabel>
            <Input
              id="workflow-email"
              name="email"
              type="email"
              placeholder="teammate@example.test"
              required
            />
            <FieldDescription>
              Invitations expire at 2026-08-02T09:30:00Z.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="workflow-role">Organization role</FieldLabel>
            <Select defaultValue="member" items={roleItems} name="role">
              <SelectTrigger id="workflow-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administrator">Administrator</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Label className="flex items-center gap-2">
            <Checkbox name="securityUpdates" defaultChecked />
            Send security updates
          </Label>
          <Button type="submit">Send invitation</Button>
        </FieldGroup>
      </FieldSet>
    </form>
  )
}

const meta = preview
  .type<{ args: { onInvite: (invitation: Invitation) => void } }>()
  .meta({
    title: "Workflows/Form",
    component: InvitationForm,
    tags: ["autodocs"],
    args: { onInvite: fn() },
  })

export const MemberInvitation = meta.story({
  play: async ({ args, canvas, step }) => {
    await step("Complete the member invitation form", async () => {
      await userEvent.type(
        canvas.getByRole("textbox", { name: "Email address" }),
        "jordan@example.test"
      )
      await userEvent.click(
        canvas.getByRole("button", { name: "Send invitation" })
      )
      await expect(args.onInvite).toHaveBeenCalledWith({
        email: "jordan@example.test",
        role: "member",
        securityUpdates: true,
      })
    })
  },
})

export const RequiredValidation = meta.story({
  play: async ({ args, canvas, step }) => {
    await step("Block submission until the email is valid", async () => {
      await userEvent.click(
        canvas.getByRole("button", { name: "Send invitation" })
      )
      await expect(
        canvas.getByRole("textbox", { name: "Email address" })
      ).toBeInvalid()
      await expect(args.onInvite).not.toHaveBeenCalled()
    })
  },
})
