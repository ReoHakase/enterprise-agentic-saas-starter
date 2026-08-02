"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { cjk } from "@streamdown/cjk"
import { code } from "@streamdown/code"
import { math } from "@streamdown/math"
import { mermaid } from "@streamdown/mermaid"
import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import type { ComponentProps } from "react"
import { memo, useCallback, useState } from "react"
import { toast } from "sonner"
import {
  Streamdown,
  type Components,
  type LinkSafetyModalProps,
} from "streamdown"

import { reportObservedError } from "@/lib/report-observed-error"

export type MessageResponseProps = ComponentProps<typeof Streamdown>

const streamdownPlugins = { cjk, code, math, mermaid }

const MessageLinkSafetyModal = ({
  isOpen,
  onClose,
  onConfirm,
  url,
}: LinkSafetyModalProps) => {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose()
    },
    [onClose]
  )
  const handleCopy = useCallback(() => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(url).catch((error: unknown) => {
      reportObservedError(error, { operation: "agent.link.copy" })
      toast.error("The link could not be copied.")
    })
  }, [url])
  const handleConfirm = useCallback(() => {
    onConfirm()
    onClose()
  }, [onClose, onConfirm])

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ExternalLinkIcon aria-hidden="true" className="size-5" />
            Open external link?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This link opens an external website. Check the destination before
            continuing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-32 overflow-y-auto rounded-md bg-muted p-3 font-mono text-sm break-all">
          {url}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button type="button" variant="outline" onClick={handleCopy}>
            <CopyIcon aria-hidden="true" />
            Copy link
          </Button>
          <Button type="button" onClick={handleConfirm}>
            <ExternalLinkIcon aria-hidden="true" />
            Open link
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type MessageMarkdownLinkProps = ComponentProps<"a"> & { node?: unknown }

const MessageMarkdownLink = ({
  children,
  className,
  href,
  node: _node,
  ...props
}: MessageMarkdownLinkProps) => {
  const [externalDialogOpen, setExternalDialogOpen] = useState(false)
  const openExternalDialog = useCallback(() => setExternalDialogOpen(true), [])
  const closeExternalDialog = useCallback(
    () => setExternalDialogOpen(false),
    []
  )
  const openExternalLink = useCallback(
    () => window.open(href, "_blank", "noreferrer"),
    [href]
  )
  const linkClassName = cn(
    "font-medium wrap-anywhere text-primary underline",
    className
  )
  if (!href || href === "streamdown:incomplete-link") {
    return (
      <span className={linkClassName} data-incomplete="true">
        {children}
      </span>
    )
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link
        {...props}
        className={linkClassName}
        data-streamdown="link"
        href={href}
      >
        {children}
      </Link>
    )
  }
  return (
    <>
      <button
        className={cn("appearance-none text-left", linkClassName)}
        data-streamdown="link"
        type="button"
        onClick={openExternalDialog}
      >
        {children}
      </button>
      <MessageLinkSafetyModal
        isOpen={externalDialogOpen}
        url={href}
        onClose={closeExternalDialog}
        onConfirm={openExternalLink}
      />
    </>
  )
}

const streamdownComponents = {
  a: MessageMarkdownLink,
} satisfies Components

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={streamdownComponents}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
)

MessageResponse.displayName = "MessageResponse"
