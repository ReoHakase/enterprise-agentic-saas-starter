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
import type { ComponentProps } from "react"
import { memo, useCallback } from "react"
import {
  Streamdown,
  type LinkSafetyConfig,
  type LinkSafetyModalProps,
} from "streamdown"

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
    void navigator.clipboard.writeText(url).catch(() => undefined)
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

const renderMessageLinkSafetyModal = (props: LinkSafetyModalProps) => (
  <MessageLinkSafetyModal {...props} />
)

const streamdownLinkSafety = {
  enabled: true,
  renderModal: renderMessageLinkSafetyModal,
} satisfies LinkSafetyConfig

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      linkSafety={streamdownLinkSafety}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
)

MessageResponse.displayName = "MessageResponse"
