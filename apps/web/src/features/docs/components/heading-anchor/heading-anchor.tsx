"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { CheckIcon, LinkIcon } from "lucide-react"
import { useCallback, useState } from "react"

import { copyToClipboard } from "../copy-to-clipboard"

export const HeadingAnchor = ({ id, title }: { id: string; title: string }) => {
  const [copied, setCopied] = useState(false)

  const copyLink = useCallback(async () => {
    const url = new URL(window.location.href)
    url.hash = id

    try {
      await copyToClipboard(url.toString())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }, [id])

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="ml-1 align-middle text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      aria-label={copied ? "Link copied" : `Copy link to ${title}`}
      onClick={copyLink}
      data-docs-heading-copy={id}
    >
      {copied ? (
        <CheckIcon aria-hidden="true" />
      ) : (
        <LinkIcon aria-hidden="true" />
      )}
    </Button>
  )
}
