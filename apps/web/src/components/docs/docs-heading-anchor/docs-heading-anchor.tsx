"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { CheckIcon, LinkIcon } from "lucide-react"
import { useCallback, useState } from "react"

export const DocsHeadingAnchor = ({
  id,
  title,
}: {
  id: string
  title: string
}) => {
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

const copyToClipboard = async (value: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand("copy")
    textarea.remove()
    if (!copied) throw new Error("Clipboard write failed")
  }
}
