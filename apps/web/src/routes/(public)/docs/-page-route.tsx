import { notFound } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestUrl } from "@tanstack/react-start/server"
import browserCollections from "collections/browser"
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb"
import type { Root } from "fumadocs-core/page-tree"
import { AnchorProvider } from "fumadocs-core/toc"
import type { MDXComponents } from "mdx/types"

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
import { collectPageIcons } from "@/lib/docs/page-tree"
import { source } from "@/lib/docs/source.server"

const docsCoverImage = "/docs/opengraph-image.png"
const docsCoverImageAlt =
  "Abstract connected nodes and layered panels on a dark background for Enterprise SaaS documentation."
const docsCoverImageHeight = 887
const docsCoverImageWidth = 1774

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

const getDocsPage = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .handler(({ data: slugs }) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()

    return {
      description: page.data.description,
      openGraphImage: page.data.opengraphImage,
      origin: getRequestUrl().origin,
      pageUrl: page.url,
      path: page.path,
      title: String(page.data.title),
    }
  })

export type DocsPageData = Awaited<ReturnType<typeof getDocsPage>>

export const loadDocsPage = async (slugs: string[]): Promise<DocsPageData> => {
  const data = await getDocsPage({ data: slugs })
  await docsClientLoader.preload(data.path)
  return data
}

export const createDocsPageHead = ({
  loaderData,
}: {
  loaderData?: DocsPageData
}) => {
  if (!loaderData) return {}

  const openGraphImage = new URL(
    loaderData.openGraphImage ?? docsCoverImage,
    loaderData.origin
  ).href

  return {
    meta: [
      { title: `${loaderData.title} · Enterprise SaaS` },
      ...(loaderData.description
        ? [{ name: "description", content: loaderData.description }]
        : []),
      { property: "og:image", content: openGraphImage },
      ...(loaderData.openGraphImage
        ? [
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:image", content: openGraphImage },
          ]
        : [
            {
              property: "og:image:alt",
              content: docsCoverImageAlt,
            },
            {
              property: "og:image:width",
              content: String(docsCoverImageWidth),
            },
            {
              property: "og:image:height",
              content: String(docsCoverImageHeight),
            },
            { property: "og:image:type", content: "image/png" },
          ]),
    ],
  }
}

type DocsContentProps = {
  pageUrl: string
  tree: Root
}

const createBreadcrumbItems = (pageUrl: string, tree: Root) => {
  const pageIcons = collectPageIcons(tree.children)
  const items = []

  for (const item of getBreadcrumbItems(pageUrl, tree, {
    includePage: true,
  })) {
    items.push({
      ...item,
      icon: item.url ? pageIcons.get(item.url) : undefined,
    })
  }

  return items
}

export const docsClientLoader =
  browserCollections.docs.createClientLoader<DocsContentProps>({
    component(
      { default: MDX, frontmatter, lastModified, toc },
      { pageUrl, tree }
    ) {
      const breadcrumbItems = createBreadcrumbItems(pageUrl, tree)
      const isRoot = pageUrl === "/docs"
      const coverImageSrc =
        frontmatter.opengraphImage ?? (isRoot ? undefined : docsCoverImage)
      const coverImageHeight = frontmatter.opengraphImage
        ? 800
        : docsCoverImageHeight
      const coverImageWidth = frontmatter.opengraphImage
        ? 1600
        : docsCoverImageWidth

      return (
        <AnchorProvider toc={toc}>
          <div className="mx-auto grid w-full max-w-4xl gap-10 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="min-w-0">
              <Breadcrumb items={breadcrumbItems} />
              <article data-docs-page="true" className="min-w-0">
                <PageHeader
                  coverImageHeight={coverImageHeight}
                  coverImageSrc={coverImageSrc}
                  coverImageWidth={coverImageWidth}
                  description={frontmatter.description}
                  icon={frontmatter.icon}
                  lastModified={lastModified}
                  title={frontmatter.title}
                />
                <TableOfContents toc={toc} variant="mobile" />
                {isRoot ? <NavigationCards tree={tree} /> : null}
                <div className="min-w-0 text-base leading-7 text-foreground [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary/80 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_del]:text-muted-foreground [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:scroll-mt-24 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mt-5 [&_h5]:mb-2 [&_h5]:font-semibold [&_hr]:my-8 [&_input[type=checkbox]]:mr-2 [&_li]:my-2 [&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-5 [&_strong]:font-semibold [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-6">
                  <MDX components={docsMdxComponents} />
                </div>
              </article>
            </div>
            <TableOfContents toc={toc} variant="desktop" />
          </div>
        </AnchorProvider>
      )
    },
  })
