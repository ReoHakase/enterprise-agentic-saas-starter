import { createFileRoute } from "@tanstack/react-router"

import {
  DocsNotFound,
  DocsPageContent,
  DocsRouteError,
  DocsRouteLoading,
} from "./-page"
import { createDocsPageHead, loadDocsPage } from "./-page-route"

const DocsIndexPage = () => <DocsPageContent data={Route.useLoaderData()} />

export const Route = createFileRoute("/(public)/docs/")({
  loader: () => loadDocsPage([]),
  component: DocsIndexPage,
  errorComponent: DocsRouteError,
  head: createDocsPageHead,
  notFoundComponent: DocsNotFound,
  pendingComponent: DocsRouteLoading,
})
