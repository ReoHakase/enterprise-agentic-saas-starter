import {
  getRouteApi,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { useFumadocsLoader } from "fumadocs-core/source/client"
import { useCallback, useEffect, useRef } from "react"

import { NavigationLinkBridge } from "@/components/navigation-link/navigation-link"

import { docsClientLoader, type DocsPageData } from "./-page-route"

const docsLayoutRoute = getRouteApi("/(public)/docs")

export const DocsPageContent = ({ data }: { data: DocsPageData }) => {
  const { pageUrl, path } = data
  const { pageTree } = useFumadocsLoader(docsLayoutRoute.useLoaderData())
  const content = docsClientLoader.useContent(path, {
    pageUrl,
    tree: pageTree,
  })

  return <>{content}</>
}

export const DocsRouteError = ({ reset }: ErrorComponentProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const router = useRouter()

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  const retry = useCallback(() => {
    reset()
    void router.invalidate()
  }, [reset, router])

  return (
    <main
      data-route-boundary="true"
      data-boundary-state="error"
      className="mx-auto flex min-h-96 w-full max-w-lg flex-col justify-center gap-5"
      role="alert"
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold outline-none"
      >
        Documentation could not be loaded
      </h1>
      <p className="text-muted-foreground">
        Try loading this page again. No account or document changes were made.
      </p>
      <button
        type="button"
        onClick={retry}
        className="w-fit rounded-4xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        Try again
      </button>
    </main>
  )
}

export const DocsRouteLoading = () => (
  <main
    data-route-boundary="true"
    data-boundary-state="loading"
    className="mx-auto w-full max-w-4xl animate-pulse space-y-6"
    aria-busy="true"
    aria-label="Loading documentation"
    role="status"
  >
    <div className="h-4 w-40 rounded bg-muted" />
    <div className="h-12 w-2/3 rounded bg-muted" />
    <div className="h-5 w-full rounded bg-muted" />
    <div className="h-5 w-5/6 rounded bg-muted" />
    <div className="h-64 rounded-2xl bg-muted" />
  </main>
)

export const DocsNotFound = () => (
  <main className="mx-auto flex min-h-96 w-full max-w-lg flex-col justify-center gap-5">
    <h1 className="text-2xl font-semibold">Documentation page not found</h1>
    <p className="text-muted-foreground">
      The documentation address may be outdated or unavailable.
    </p>
    <NavigationLinkBridge
      href="/docs"
      className="w-fit rounded-4xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
    >
      Back to documentation
    </NavigationLinkBridge>
  </main>
)
