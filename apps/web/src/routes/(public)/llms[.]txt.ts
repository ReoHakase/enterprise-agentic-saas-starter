import { createFileRoute } from "@tanstack/react-router"
import { llms } from "fumadocs-core/source"

import { source } from "@/lib/docs/source.server"
import {
  createGetOnlyOptionsResponse,
  createMethodNotAllowedResponse,
  createWebResponseHeaders,
} from "@/lib/web-response-headers"

export const Route = createFileRoute("/(public)/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(llms(source).index(), {
          headers: createWebResponseHeaders({
            "Content-Type": "text/plain; charset=utf-8",
          }),
        }),
      OPTIONS: createGetOnlyOptionsResponse,
      ANY: createMethodNotAllowedResponse,
    },
  },
})
