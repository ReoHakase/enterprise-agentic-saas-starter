import { expect, userEvent } from "storybook/test"

import preview from "#storybook/preview"

import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from "./tabs"

const meta = preview.meta({
  component: Tabs,
  title: "Components/Tabs",
})

export default meta

export const KeyboardNavigation = meta.story({
  render: () => (
    <Tabs defaultValue="typescript" className="w-96">
      <TabsList activateOnFocus className="gap-1 border-b">
        <TabsTrigger value="typescript" className="px-3 py-2">
          TypeScript
        </TabsTrigger>
        <TabsTrigger value="curl" className="px-3 py-2">
          cURL
        </TabsTrigger>
        <TabsIndicator className="bottom-0 h-0.5 bg-primary transition-all" />
      </TabsList>
      <TabsContent value="typescript" className="p-4">
        Type-safe client example
      </TabsContent>
      <TabsContent value="curl" className="p-4">
        Shell client example
      </TabsContent>
    </Tabs>
  ),
  play: async ({ canvas }) => {
    const typescript = canvas.getByRole("tab", { name: "TypeScript" })
    const curl = canvas.getByRole("tab", { name: "cURL" })

    typescript.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(curl).toHaveAttribute("aria-selected", "true")
    await expect(canvas.getByText("Shell client example")).toBeVisible()
  },
})
