import { createFileRoute } from "@tanstack/react-router"

import {
  DocsNotFound,
  DocsPageContent,
  DocsRouteError,
  DocsRouteLoading,
} from "./-page"
import { createDocsPageHead, loadDocsPage } from "./-page-route"

const getDocsSlugs = (splat: string | undefined): string[] =>
  splat ? splat.split("/").filter(Boolean) : []

const DocsPage = () => <DocsPageContent data={Route.useLoaderData()} />

export const Route = createFileRoute("/(public)/docs/$")({
  loader: ({ params }) => loadDocsPage(getDocsSlugs(params._splat)),
  component: DocsPage,
  errorComponent: DocsRouteError,
  head: createDocsPageHead,
  notFoundComponent: DocsNotFound,
  pendingComponent: DocsRouteLoading,
})
