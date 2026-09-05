import { createFileRoute } from "@tanstack/react-router"

import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
} from "@/lib/web-response-headers"

import {
  createDocsMarkdownNotFoundResponse,
  createDocsMarkdownResponse,
} from "./-markdown-response"

export const Route = createFileRoute("/(public)/docs/{$}.md")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = params._splat?.split("/").filter(Boolean)
        if (!slugs?.length) return createDocsMarkdownNotFoundResponse()

        return createDocsMarkdownResponse(slugs)
      },
      OPTIONS: createGetOnlyOptionsResponse,
      ANY: createMethodNotAllowedResponse,
    },
  },
})
