import { getLLMText } from "@/lib/docs/llm-text"
import { source } from "@/lib/docs/source.server"
import { createWebResponseHeaders } from "@/lib/web-response-headers"

export const createDocsMarkdownNotFoundResponse = () =>
  new Response("Not Found", {
    headers: createWebResponseHeaders(),
    status: 404,
  })

export const createDocsMarkdownResponse = async (slugs?: string[]) => {
  const page = source.getPage(slugs)
  if (!page) return createDocsMarkdownNotFoundResponse()

  return new Response(await getLLMText(page), {
    headers: createWebResponseHeaders({
      "Content-Type": "text/markdown; charset=utf-8",
    }),
  })
}
