import preview from "#storybook/preview"

import {
  DocsTabs,
  DocsTabsContent,
  DocsTabsList,
  DocsTabsTrigger,
} from "./docs-tabs"

const meta = preview.meta({
  component: DocsTabs,
  title: "Docs/DocsTabs",
})

export default meta

export const Default = meta.story({
  args: {
    defaultValue: "typescript",
    children: (
      <>
        <DocsTabsList>
          <DocsTabsTrigger value="typescript">TypeScript</DocsTabsTrigger>
          <DocsTabsTrigger value="curl">cURL</DocsTabsTrigger>
        </DocsTabsList>
        <DocsTabsContent value="typescript">
          <pre>{"const response = await client.list()"}</pre>
        </DocsTabsContent>
        <DocsTabsContent value="curl">
          <pre>{"curl https://example.com"}</pre>
        </DocsTabsContent>
      </>
    ),
  },
})
