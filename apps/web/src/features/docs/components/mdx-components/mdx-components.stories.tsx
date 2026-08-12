import type { CSSProperties } from "react"
import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { CodeBlock } from "../code-block/code-block"
import { File, Files, Folder } from "../file-tree/file-tree"
import { Step, Steps } from "../steps/steps"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs/tabs"
import { TypeTable } from "../type-table/type-table"
import { ZoomableImage } from "../zoomable-image/zoomable-image"

const previewImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='600' viewBox='0 0 1200 600'%3E%3Crect width='1200' height='600' fill='%2318181b'/%3E%3Cpath d='M180 420L420 180l180 180 140-140 280 280H180z' fill='%233f3f46'/%3E%3Ccircle cx='850' cy='170' r='70' fill='%23fafafa'/%3E%3C/svg%3E"
const tokenStyle: CSSProperties &
  Record<"--shiki-dark" | "--shiki-light", string> = {
  "--shiki-dark": "#ff7b72",
  "--shiki-light": "#cf222e",
}
const typeProperties = {
  organizationId: {
    description: "The organization bound to the request.",
    required: true,
    type: "string",
  },
  revision: {
    default: "current",
    description: "The expected resource revision.",
    type: "number",
  },
}

const meta = preview.meta({
  title: "Docs/MDX Components",
})

export default meta

export const ComponentSet = meta.story({
  render: () => (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <CodeBlock title="client.ts">
        <code>
          <span>
            <span style={tokenStyle}>const</span> client = createClient()
          </span>
        </code>
      </CodeBlock>

      <Files>
        <Folder name="integration" defaultOpen>
          <File name="client.ts" />
          <File name="config.ts" />
        </Folder>
        <File name="package.json" />
      </Files>

      <Steps>
        <Step>
          <h3 className="font-semibold">Discover tools</h3>
          <p className="text-muted-foreground">Read the authorized catalog.</p>
        </Step>
        <Step>
          <h3 className="font-semibold">Call a tool</h3>
          <p className="text-muted-foreground">Send an idempotent request.</p>
        </Step>
      </Steps>

      <Tabs defaultValue="typescript">
        <TabsList>
          <TabsTrigger value="typescript">TypeScript</TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
        </TabsList>
        <TabsContent value="typescript">Type-safe client</TabsContent>
        <TabsContent value="curl">Shell client</TabsContent>
      </Tabs>

      <TypeTable type={typeProperties} />

      <ZoomableImage
        alt="Abstract documentation preview"
        src={previewImage}
        width={1200}
        height={600}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    const curl = canvas.getByRole("tab", { name: "cURL" })
    curl.focus()
    await userEvent.keyboard("{ArrowLeft}")
    await expect(
      canvas.getByRole("tab", { name: "TypeScript" })
    ).toHaveAttribute("aria-selected", "true")

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Zoom documentation image",
      })
    )
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog")
      ).toBeVisible()
    )
  },
})
