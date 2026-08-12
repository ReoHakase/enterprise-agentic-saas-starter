import { getBreadcrumbItems } from "fumadocs-core/breadcrumb"
import { AnchorProvider } from "fumadocs-core/toc"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { DocsBreadcrumb } from "@/components/docs/docs-breadcrumb/docs-breadcrumb"
import {
  DocsH2,
  DocsH3,
  DocsH4,
} from "@/components/docs/docs-heading/docs-heading"
import { DocsNavigationCards } from "@/components/docs/docs-navigation-cards/docs-navigation-cards"
import { DocsPageHeader } from "@/components/docs/docs-page-header/docs-page-header"
import { DocsTableOfContents } from "@/components/docs/docs-table-of-contents/docs-table-of-contents"
import {
  DocsTabs,
  DocsTabsContent,
  DocsTabsList,
  DocsTabsTrigger,
} from "@/components/docs/docs-tabs/docs-tabs"
import { source } from "@/lib/docs/source"

const docsMdxComponents = {
  CodeBlockTabs: DocsTabs,
  Tabs: DocsTabs,
  TabsContent: DocsTabsContent,
  TabsList: DocsTabsList,
  TabsTrigger: DocsTabsTrigger,
  h2: DocsH2,
  h3: DocsH3,
  h4: DocsH4,
}

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

  const customImage = page.data.opengraphImage

  return {
    title: page.data.title,
    description: page.data.description,
    ...(customImage
      ? {
          openGraph: {
            images: [customImage],
          },
          twitter: {
            card: "summary_large_image" as const,
            images: [customImage],
          },
        }
      : {}),
  }
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) notFound()

  const MDX = page.data.body
  const tree = source.getPageTree()
  const breadcrumbItems = getDocsBreadcrumbItems(page.url, tree)
  const isRoot = !slug?.length

  return (
    <AnchorProvider toc={page.data.toc}>
      <div className="mx-auto grid w-full max-w-4xl gap-10 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0">
          <DocsBreadcrumb items={breadcrumbItems} />
          <article
            data-docs-page="true"
            className="min-w-0 text-base leading-7 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary/80 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_del]:text-muted-foreground [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:scroll-mt-24 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mt-5 [&_h5]:mb-2 [&_h5]:font-semibold [&_hr]:my-8 [&_input[type=checkbox]]:mr-2 [&_li]:my-2 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-6 [&_strong]:font-semibold [&_table]:my-6 [&_table]:w-full [&_td]:border [&_td]:p-3 [&_th]:border [&_th]:bg-muted [&_th]:p-3 [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6"
          >
            <DocsPageHeader
              description={page.data.description}
              icon={page.data.icon}
              lastModified={page.data.lastModified}
              title={page.data.title}
            />
            {isRoot ? <DocsNavigationCards tree={tree} /> : null}
            <MDX components={docsMdxComponents} />
          </article>
        </div>
        <DocsTableOfContents toc={page.data.toc} />
      </div>
    </AnchorProvider>
  )
}

const getSlugFromDocsUrl = (url: string): string[] | undefined => {
  const pathname = url.replace(/^\/docs\/?/u, "")
  return pathname ? pathname.split("/").filter(Boolean) : undefined
}

const getDocsBreadcrumbItems = (
  url: string,
  tree: ReturnType<typeof source.getPageTree>
) =>
  getBreadcrumbItems(url, tree, { includePage: true }).map((item) => ({
    icon: item.url
      ? source.getPage(getSlugFromDocsUrl(item.url))?.data.icon
      : undefined,
    name: item.name,
    url: item.url,
  }))
