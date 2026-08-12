import { notFound } from "next/navigation"

import { getLLMText } from "@/lib/docs/llm-text"
import { source } from "@/lib/docs/source"

export const revalidate = false

export const generateStaticParams = () => source.generateParams()

type MarkdownRouteContext = {
  params: Promise<{ slug?: string[] }>
}

export const GET = async (
  _request: Request,
  { params }: MarkdownRouteContext
) => {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) notFound()

  return new Response(await getLLMText(page), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  })
}
