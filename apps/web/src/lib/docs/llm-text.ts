import type { source } from "@/lib/docs/source"

type DocsPage = (typeof source)["$inferPage"]

export const getLLMText = async (page: DocsPage): Promise<string> => {
  const markdown = await page.data.getText("processed")

  return `# ${page.data.title} (${page.url})\n\n${markdown}`
}
