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
})
