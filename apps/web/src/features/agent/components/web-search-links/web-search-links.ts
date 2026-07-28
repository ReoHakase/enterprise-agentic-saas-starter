import { canonicalizePublicHttpUrl } from "@enterprise-agentic-saas/api/client"
import * as v from "valibot"

const webSearchOutputSchema = v.object({
  sources: v.pipe(
    v.array(
      v.object({
        title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
        url: v.pipe(v.string(), v.minLength(1), v.maxLength(2_048)),
      })
    ),
    v.maxLength(5)
  ),
})

export const webSearchLinksFromToolOutput = (
  toolName: string,
  output: unknown
) => {
  if (toolName !== "web_search") return []
  const parsed = v.safeParse(webSearchOutputSchema, output)
  if (!parsed.success) return []
  return parsed.output.sources.flatMap((source) => {
    const url = canonicalizePublicHttpUrl(source.url)
    return url ? [{ title: source.title, url }] : []
  })
}
