import { createFileRoute } from "@tanstack/react-router"

import { getLLMText } from "@/lib/docs/llm-text"
import { source } from "@/lib/docs/source.server"
import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
  createWebResponseHeaders,
} from "@/lib/web-response-headers"

export const Route = createFileRoute("/(public)/llms-full.txt")({
  server: {
    handlers: {
      GET: async () => {
        const pages = await Promise.all(source.getPages().map(getLLMText))

        return new Response(pages.join("\n\n"), {
          headers: createWebResponseHeaders({
            "Content-Type": "text/plain; charset=utf-8",
          }),
        })
      },
      OPTIONS: createGetOnlyOptionsResponse,
      ANY: createMethodNotAllowedResponse,
    },
  },
})
