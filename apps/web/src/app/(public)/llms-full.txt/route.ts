import { getLLMText } from "@/lib/docs/llm-text"
import { source } from "@/lib/docs/source"

export const revalidate = false

export const GET = async () => {
  const pages = await Promise.all(source.getPages().map(getLLMText))

  return new Response(pages.join("\n\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
