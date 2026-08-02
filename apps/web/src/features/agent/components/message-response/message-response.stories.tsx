import { expect, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import { MessageResponse } from "./message-response"

const MessageResponseExample = ({
  children,
  isAnimating = false,
}: {
  children: string
  isAnimating?: boolean
}) => <MessageResponse isAnimating={isAnimating}>{children}</MessageResponse>

const richContent = `## Tenant access review

The **Acme Cloud** membership check passed.

| Boundary | Result |
| --- | --- |
| Organization | Acme Cloud |
| Repository filter | Enforced |

\`\`\`ts
const organizationId = "org_01K1ACMECLOUD0000000000"
\`\`\`

日本語と English が混在しても自然に折り返します。

The available budget is $128000 - 4096$ tokens.

\`\`\`mermaid
flowchart LR
  Request --> Authorization --> Repository
\`\`\``

const meta = preview.meta({
  title: "Web/Agent/Message Response",
  component: MessageResponseExample,
  tags: ["autodocs"],
})

export const RichMarkdown = meta.story({
  tags: ["theme-sensitive"],
  args: { children: richContent },
  play: async ({ canvas, step }) => {
    await step("Render structured technical content", async () => {
      await expect(
        await canvas.findByRole("heading", { name: "Tenant access review" })
      ).toBeVisible()
      await expect(canvas.getByRole("table")).toHaveTextContent(
        "Repository filter"
      )
      await expect(canvas.getByText(/日本語と English/)).toBeVisible()
    })
  },
})

export const Streaming = meta.story({
  args: {
    children:
      "Reviewing membership, organization scope, and repository filters…",
    isAnimating: true,
  },
  play: async ({ canvas, step }) => {
    await step("Keep partial text readable while streaming", async () => {
      await expect(canvas.getByText(/Reviewing membership/)).toBeVisible()
    })
  },
})

export const ExternalLinkConfirmation = meta.story({
  args: {
    children:
      "[Open the external runbook](https://runbook.example.test/tenant-access)",
  },
  play: async ({ canvas, canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)

    await step("Confirm an external destination before opening", async () => {
      await userEvent.click(
        await canvas.findByRole("button", {
          name: "Open the external runbook",
        })
      )
      await expect(
        body.getByRole("alertdialog", { name: "Open external link?" })
      ).toBeInTheDocument()
      await expect(
        body.getByText("https://runbook.example.test/tenant-access")
      ).toBeInTheDocument()
      await userEvent.keyboard("{Escape}")
      await waitFor(() =>
        expect(
          body.queryByRole("alertdialog", { name: "Open external link?" })
        ).not.toBeInTheDocument()
      )
    })
  },
})
