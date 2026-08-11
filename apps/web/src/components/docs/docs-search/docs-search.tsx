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
import { SearchIcon } from "lucide-react"
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"

const searchClient = fetchClient()
const searchTrigger = (
  <Button type="button" variant="outline" aria-label="Search documentation" />
)
const stripSearchHighlights = (content: string) =>
  content.replaceAll(/<\/?mark>/gu, "")

export const DocsSearch = () => {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const { search, setSearch, query } = useDocsSearch({
    client: searchClient,
  })

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

      if (!nextOpen) setSearch("")
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

  const results = Array.isArray(query.data) ? query.data : []
  const hasSearch = search.trim().length > 0
  const hasResults = results.length > 0
  const isEmpty =
    hasSearch &&
    !query.isLoading &&
    !query.error &&
    (query.data === "empty" || results.length === 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={searchTrigger}>
        <SearchIcon />
        <span className="hidden sm:inline">Search</span>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search documentation</DialogTitle>
          <DialogDescription>
            Search the public manual and developer documentation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label htmlFor={inputId} className="sr-only">
            Search documentation
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            value={search}
            onChange={handleSearchChange}
            placeholder="Search documentation"
            autoComplete="off"
          />
          <div aria-live="polite" aria-atomic="true">
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
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {results.map((result) => (
                  <li key={result.id}>
                    <FumaLink
                      href={result.url}
                      onClick={handleResultSelect}
                      className="block rounded-2xl border p-3 transition-colors hover:bg-muted focus-visible:bg-muted"
                    >
                      <span className="block font-medium text-foreground">
                        {stripSearchHighlights(result.content)}
                      </span>
                      {result.breadcrumbs?.length ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {result.breadcrumbs.join(" / ")}
                        </span>
                      ) : null}
                    </FumaLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
