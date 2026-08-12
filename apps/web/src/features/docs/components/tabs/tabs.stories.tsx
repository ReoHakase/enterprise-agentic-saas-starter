import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

const meta = preview.meta({
  component: Tabs,
  title: "Docs/Tabs",
})

export default meta

export const Default = meta.story({
  args: {
    defaultValue: "typescript",
    children: (
      <>
        <TabsList>
          <TabsTrigger value="typescript">TypeScript</TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
        </TabsList>
        <TabsContent value="typescript">
          <pre>{"const response = await client.list()"}</pre>
        </TabsContent>
        <TabsContent value="curl">
          <pre>{"curl https://example.com"}</pre>
        </TabsContent>
      </>
    ),
  },
  play: async ({ canvas }) => {
    const typescript = canvas.getByRole("tab", { name: "TypeScript" })
    const curl = canvas.getByRole("tab", { name: "cURL" })

    typescript.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(curl).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByText("curl https://example.com")).toBeVisible()
  },
})
