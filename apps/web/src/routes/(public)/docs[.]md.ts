import { createFileRoute } from "@tanstack/react-router"

import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
} from "@/lib/web-response-headers"

import { createDocsMarkdownResponse } from "./docs/-markdown-response"

export const Route = createFileRoute("/(public)/docs.md")({
  server: {
    handlers: {
      GET: () => createDocsMarkdownResponse(),
      OPTIONS: createGetOnlyOptionsResponse,
      ANY: createMethodNotAllowedResponse,
    },
  },
})
