"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { CheckIcon, CopyIcon } from "lucide-react"
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react"

import { copyToClipboard } from "../copy-to-clipboard"

type CodeBlockProps = ComponentProps<"pre"> & {
  icon?: ReactNode
  title?: string
}

export const CodeBlock = ({
  children,
  className,
  icon,
  title,
  ...props
}: CodeBlockProps) => {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const code = preRef.current?.textContent
    if (!code) return

    try {
      await copyToClipboard(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [])

  return (
    <figure
      className="group relative my-6 min-w-0 overflow-hidden rounded-2xl border bg-card shadow-xs"
      data-docs-code-block
    >
      {title || icon ? (
        <figcaption className="flex min-h-10 items-center gap-2 border-b bg-muted/50 px-4 py-2.5 pr-12 font-mono text-xs font-medium text-muted-foreground">
          {icon ? (
            <span
              aria-hidden="true"
              className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4"
              {...(typeof icon === "string"
                ? { dangerouslySetInnerHTML: { __html: icon } }
                : { children: icon })}
            />
          ) : null}
          {title ? <span>{title}</span> : null}
        </figcaption>
      ) : null}
      <pre
        ref={preRef}
        className={cn(
          "m-0 max-w-full overflow-x-auto rounded-none bg-(--shiki-light-bg) p-4 font-mono text-sm leading-6 text-(--shiki-light) focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset dark:bg-(--shiki-dark-bg) dark:text-(--shiki-dark) [&_.line]:inline-block [&_.line]:min-h-6 [&_.line]:w-full [&_span]:text-(--shiki-light) dark:[&_span]:text-(--shiki-dark) [&>code]:block [&>code]:min-w-max [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit",
          className
        )}
        {...props}
      >
        {children}
      </pre>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        className="absolute top-2.5 right-2.5 opacity-80 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={copied ? "Code copied" : "Copy code"}
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
      </Button>
    </figure>
  )
}
