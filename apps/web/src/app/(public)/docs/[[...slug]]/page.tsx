import { getBreadcrumbItems } from "fumadocs-core/breadcrumb"
import { AnchorProvider } from "fumadocs-core/toc"
import type { MDXComponents } from "mdx/types"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  Breadcrumb,
  CodeBlock,
  File,
  Files,
  Folder,
  H2,
  H3,
  H4,
  NavigationCards,
  PageHeader,
  Step,
  Steps,
  Table,
  TableOfContents,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TypeTable,
  ZoomableImage,
} from "@/features/docs"
import { source } from "@/lib/docs/source"

import docsCoverImage from "../opengraph-image.png"

const docsMdxComponents = {
  CodeBlockTabs: Tabs,
  File,
  Files,
  Folder,
  Step,
  Steps,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TypeTable,
  h2: H2,
  h3: H3,
  h4: H4,
  img: ZoomableImage,
  pre: CodeBlock,
  table: Table,
} satisfies MDXComponents

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
  const coverImageSrc =
    page.data.opengraphImage ?? (isRoot ? undefined : docsCoverImage)
  const coverImageHeight = page.data.opengraphImage
    ? 800
    : docsCoverImage.height
  const coverImageWidth = page.data.opengraphImage ? 1600 : docsCoverImage.width

  return (
    <AnchorProvider toc={page.data.toc}>
      <div className="mx-auto grid w-full max-w-4xl gap-10 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0">
          <Breadcrumb items={breadcrumbItems} />
          <article data-docs-page="true" className="min-w-0">
            <PageHeader
              coverImageHeight={coverImageHeight}
              coverImageSrc={coverImageSrc}
              coverImageWidth={coverImageWidth}
              description={page.data.description}
              icon={page.data.icon}
              lastModified={page.data.lastModified}
              title={page.data.title}
            />
            <TableOfContents toc={page.data.toc} variant="mobile" />
            {isRoot ? <NavigationCards tree={tree} /> : null}
            <div className="min-w-0 text-base leading-7 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary/80 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_del]:text-muted-foreground [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:scroll-mt-24 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mt-5 [&_h5]:mb-2 [&_h5]:font-semibold [&_hr]:my-8 [&_input[type=checkbox]]:mr-2 [&_li]:my-2 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_strong]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6">
              <MDX components={docsMdxComponents} />
            </div>
          </article>
        </div>
        <TableOfContents toc={page.data.toc} variant="desktop" />
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
