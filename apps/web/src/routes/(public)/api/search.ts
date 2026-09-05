import { createFileRoute } from "@tanstack/react-router"
import { createFromSource } from "fumadocs-core/search/server"

import { source } from "@/lib/docs/source.server"
import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
  createWebResponseHeaders,
} from "@/lib/web-response-headers"

const search = createFromSource(source)

export const Route = createFileRoute("/(public)/api/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await search.GET(request)
        return new Response(response.body, {
          headers: createWebResponseHeaders(response.headers),
          status: response.status,
          statusText: response.statusText,
        })
      },
      OPTIONS: createGetOnlyOptionsResponse,
      ANY: createMethodNotAllowedResponse,
    },
  },
})
