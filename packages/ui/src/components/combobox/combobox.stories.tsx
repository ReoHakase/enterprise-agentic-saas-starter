import { expect, fn, userEvent, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "./combobox"

const organizations = ["Acme Cloud", "Northstar Labs", "Orbit Works"]

const meta: ReturnType<typeof preview.meta> = preview.meta({
  title: "Components/Combobox",
  component: Combobox,
  tags: ["autodocs"],
})

const OrganizationCombobox = ({ disabled = false }: { disabled?: boolean }) => (
  <Combobox items={organizations} onValueChange={fn()}>
    <ComboboxInput
      aria-label="Organization"
      placeholder="Choose an organization"
      disabled={disabled}
      showTrigger={false}
    />
    <ComboboxContent>
      <ComboboxEmpty>No organization found.</ComboboxEmpty>
      <ComboboxList aria-label="Organizations">
        <ComboboxGroup>
          <ComboboxLabel>Organizations</ComboboxLabel>
          <ComboboxCollection>
            {(organization: string) => (
              <ComboboxItem key={organization} value={organization}>
                {organization}
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxGroup>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
)

export const Organization: ReturnType<typeof meta.story> = meta.story({
  render: () => <OrganizationCombobox />,
  play: async ({ canvas, canvasElement, step }) => {
    await step("組織を絞り込んで選択する", async () => {
      const input = canvas.getByRole("combobox", { name: "Organization" })
      await userEvent.click(input)
      await userEvent.type(input, "North")
      const body = within(canvasElement.ownerDocument.body)
      await userEvent.click(
        await body.findByRole("option", { name: "Northstar Labs" })
      )
      await expect(input).toHaveValue("Northstar Labs")
      await expect(input).toHaveFocus()
    })
  },
})

export const NoMatches: ReturnType<typeof meta.story> = meta.story({
  render: () => (
    <div className="grid gap-2">
      <Combobox items={organizations}>
        <ComboboxInput
          aria-describedby="organization-no-match"
          aria-label="Organization"
          showTrigger={false}
          value="Unavailable tenant"
        />
      </Combobox>
      <p id="organization-no-match" role="status" className="text-sm">
        No organization found.
      </p>
    </div>
  ),
})

export const Disabled: ReturnType<typeof meta.story> = meta.story({
  render: () => <OrganizationCombobox disabled />,
})
