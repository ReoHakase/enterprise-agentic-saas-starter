import { getBreadcrumbItems } from "fumadocs-core/breadcrumb"
import FumaLink from "fumadocs-core/link"
import { AnchorProvider } from "fumadocs-core/toc"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DocsTableOfContents } from "@/components/docs/docs-table-of-contents/docs-table-of-contents"
import { source } from "@/lib/docs/source"

type DocsPageProps = {
  params: Promise<{ slug?: string[] }>
}

export const generateStaticParams = () => source.generateParams("slug")

export const generateMetadata = async ({
  params,
}: DocsPageProps): Promise<Metadata> => {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) return {}

  return {
    title: page.data.title,
    description: page.data.description,
  }
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) notFound()

  const MDX = page.data.body
  const tree = source.getPageTree()
  const breadcrumbItems = getBreadcrumbItems(page.url, tree, {
    includePage: true,
  })

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-10 xl:max-w-6xl xl:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap gap-2 text-sm text-muted-foreground"
        >
          {breadcrumbItems.map((item, index) => (
            <span
              key={item.url ?? String(item.name)}
              className="flex items-center gap-2"
            >
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {item.url ? (
                <FumaLink href={item.url} className="hover:text-foreground">
                  {item.name}
                </FumaLink>
              ) : (
                <span>{item.name}</span>
              )}
            </span>
          ))}
        </nav>
        <AnchorProvider toc={page.data.toc}>
          <article
            data-docs-page="true"
            className="min-w-0 text-base leading-7 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary/80 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-8 [&_li]:my-2 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-6 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_td]:border [&_td]:p-3 [&_th]:border [&_th]:bg-muted [&_th]:p-3 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6"
          >
            <header className="mb-10 border-b pb-8">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                {page.data.title}
              </h1>
              {page.data.description ? (
                <p className="mt-4 text-lg text-muted-foreground">
                  {page.data.description}
                </p>
              ) : null}
            </header>
            <MDX />
          </article>
          <DocsTableOfContents toc={page.data.toc} />
        </AnchorProvider>
      </div>
    </div>
  )
}
