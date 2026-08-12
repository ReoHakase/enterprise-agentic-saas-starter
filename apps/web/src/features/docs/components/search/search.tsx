"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@enterprise-agentic-saas/ui/components/dialog"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import FumaLink from "fumadocs-core/link"
import { useDocsSearch } from "fumadocs-core/search/client"
import { fetchClient } from "fumadocs-core/search/client/fetch"
import { ChevronRightIcon, FileTextIcon, SearchIcon } from "lucide-react"
import { marked, Renderer } from "marked"
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type SearchPage = {
  icon?: ReactNode
  title: string
  url: string
}

const searchClient = fetchClient()
const searchTrigger = (
  <Button
    type="button"
    variant="outline"
    className="w-full justify-start gap-2"
    aria-label="Search Documentation"
    aria-keyshortcuts="Meta+K Control+K"
    data-docs-search-trigger
  />
)

const searchMarkdownRenderer = new Renderer()
searchMarkdownRenderer.html = ({ raw }) => {
  if (raw === "<mark>")
    return '<mark data-docs-search-highlight="true" class="rounded bg-yellow-200 px-0.5 font-medium text-foreground dark:bg-yellow-500/30">'
  if (raw === "</mark>") return "</mark>"
  return ""
}

export const Search = ({ pages }: { pages: SearchPage[] }) => {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const resultIdPrefix = useId().replace(/:/gu, "")
  const { search, setSearch, query } = useDocsSearch({
    client: searchClient,
  })

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }

    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)

      if (!nextOpen) {
        setSearch("")
        setActiveIndex(0)
        queueMicrotask(() =>
          document
            .querySelector<HTMLButtonElement>("[data-docs-search-trigger]")
            ?.focus()
        )
      }
    },
    [setSearch]
  )

  const handleResultSelect = useCallback(() => {
    handleOpenChange(false)
  }, [handleOpenChange])

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value)
    },
    [setSearch]
  )

  const results = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data]
  )
  const hasSearch = search.trim().length > 0
  const hasResults = results.length > 0
  const isEmpty =
    hasSearch &&
    !query.isLoading &&
    !query.error &&
    (query.data === "empty" || results.length === 0)

  useEffect(() => {
    setActiveIndex(0)
  }, [query.data, search])

  useEffect(() => {
    if (!open || !hasResults) return

    document
      .getElementById(`${resultIdPrefix}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, hasResults, open, resultIdPrefix])

  const renderedResults = useMemo(
    () =>
      results.map((result) => ({
        ...result,
        searchContentHtml: {
          __html: renderSearchContent(result.content),
        },
      })),
    [results]
  )

  const handleResultMouseEnter = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>) => {
      const index = Number(event.currentTarget.dataset.resultIndex)
      if (Number.isInteger(index)) setActiveIndex(index)
    },
    []
  )

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (!hasResults) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, results.length - 1))
        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        return
      }

      if (event.key === "Home") {
        event.preventDefault()
        setActiveIndex(0)
        return
      }

      if (event.key === "End") {
        event.preventDefault()
        setActiveIndex(results.length - 1)
        return
      }

      if (event.key === "Enter") {
        event.preventDefault()
        document.getElementById(`${resultIdPrefix}-${activeIndex}`)?.click()
      }
    },
    [activeIndex, hasResults, resultIdPrefix, results.length]
  )

  const searchStatus = query.isLoading
    ? ""
    : query.error
      ? ""
      : isEmpty
        ? "Search complete. No results."
        : hasResults
          ? `${results.length} documentation results found.`
          : ""
  const activeResultId = hasResults
    ? `${resultIdPrefix}-${activeIndex}`
    : undefined

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={searchTrigger}>
        <SearchIcon aria-hidden="true" />
        <span>Search Documentation</span>
        <kbd className="ml-auto hidden rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-4xl sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Search Documentation</DialogTitle>
          <DialogDescription>
            Search the public manual and developer documentation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label htmlFor={inputId} className="sr-only">
            Search Documentation
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            value={search}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search Documentation"
            autoComplete="off"
            tabIndex={0}
            role="combobox"
            aria-autocomplete="list"
            aria-activedescendant={activeResultId}
            aria-controls={hasResults ? "docs-search-results" : undefined}
            aria-expanded={hasResults}
            aria-keyshortcuts="ArrowDown ArrowUp Home End Enter"
          />
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {searchStatus}
          </p>
          <div>
            {query.isLoading && hasSearch ? (
              <p role="status" className="text-sm text-muted-foreground">
                Searching documentation…
              </p>
            ) : null}
            {query.error ? (
              <p role="alert" className="text-sm text-destructive">
                Search is temporarily unavailable. Try again.
              </p>
            ) : null}
            {isEmpty ? (
              <p className="text-sm text-muted-foreground">
                No documentation results found.
              </p>
            ) : null}
            {hasResults ? (
              <div
                id="docs-search-results"
                className="max-h-[min(60svh,32rem)] space-y-2 overflow-y-auto pr-1"
                role="listbox"
              >
                {renderedResults.map((result, index) => {
                  const page = pages.find(
                    (candidate) => candidate.url === getPageUrl(result.url)
                  )
                  const isActive = index === activeIndex

                  return (
                    <div key={result.id} role="presentation">
                      <FumaLink
                        id={`${resultIdPrefix}-${index}`}
                        href={result.url}
                        onClick={handleResultSelect}
                        onMouseEnter={handleResultMouseEnter}
                        className="block rounded-2xl border p-4 transition-colors hover:bg-muted focus-visible:bg-muted data-[active=true]:border-primary/50 data-[active=true]:bg-muted/60"
                        data-active={isActive}
                        data-docs-search-result
                        data-result-index={index}
                        role="option"
                        aria-selected={isActive}
                        tabIndex={-1}
                      >
                        <span
                          className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                          data-docs-search-location
                        >
                          <span className="flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
                            {page?.icon ?? <FileTextIcon aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 truncate">
                            {page?.title ?? "Documentation"}
                          </span>
                          {result.breadcrumbs?.length ? (
                            <>
                              <ChevronRightIcon
                                aria-hidden="true"
                                className="size-3 shrink-0"
                              />
                              <span className="min-w-0 truncate">
                                {result.breadcrumbs.join(" / ")}
                              </span>
                            </>
                          ) : null}
                        </span>
                        <span
                          className="mt-2 block text-sm leading-6 text-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_del]:text-muted-foreground"
                          data-docs-search-result-content
                          dangerouslySetInnerHTML={result.searchContentHtml}
                        />
                      </FumaLink>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const getPageUrl = (url: string): string => url.split("#", 1)[0] ?? url

const renderSearchContent = (content: string): string =>
  marked.parseInline(content, {
    async: false,
    gfm: true,
    renderer: searchMarkdownRenderer,
  })
