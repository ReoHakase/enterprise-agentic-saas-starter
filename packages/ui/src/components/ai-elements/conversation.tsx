"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { ArrowDownIcon } from "lucide-react"
import { useCallback, useEffect, type ComponentProps } from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"

export const useConversation = useStickToBottomContext

const ConversationScrollAccess = () => {
  const { scrollRef } = useStickToBottomContext()
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.tabIndex = 0
    element.setAttribute("aria-label", "メッセージ履歴")
  }, [scrollRef])
  return null
}

export const Conversation = ({
  className,
  ...props
}: ComponentProps<typeof StickToBottom>) => (
  <StickToBottom
    className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)}
    initial="instant"
    resize="smooth"
    role="log"
    {...props}
  />
)

export const ConversationContent = ({
  children,
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) => (
  <StickToBottom.Content
    className={cn(
      "mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6",
      className
    )}
    {...props}
  >
    {(context) => (
      <>
        <ConversationScrollAccess />
        {typeof children === "function" ? children(context) : children}
      </>
    )}
  </StickToBottom.Content>
)

export const ConversationScrollButton = ({
  className,
  ...props
}: ComponentProps<typeof Button>) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  const handleClick = useCallback(() => {
    void scrollToBottom()
  }, [scrollToBottom])
  if (isAtBottom) return null
  return (
    <Button
      aria-label="最新のメッセージへ移動"
      className={cn(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background shadow-sm",
        className
      )}
      onClick={handleClick}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon aria-hidden />
    </Button>
  )
}
