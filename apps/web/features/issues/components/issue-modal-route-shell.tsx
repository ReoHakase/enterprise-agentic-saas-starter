"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@enterprise-agentic-saas/ui/components/dialog"
import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react"

type CloseHandler = () => void

type IssueModalNavigationContextValue = {
  registerCloseHandler: (handler: CloseHandler) => () => void
}

const IssueModalNavigationContext =
  createContext<IssueModalNavigationContextValue | null>(null)

/**
 * Intercepted issue content can register its dirty-state-aware close behavior.
 * The hook is intentionally a no-op on the canonical full-page route.
 */
export const useIssueModalNavigation = (handler?: CloseHandler) => {
  const context = useContext(IssueModalNavigationContext)

  useEffect(() => {
    if (!context || !handler) return
    return context.registerCloseHandler(handler)
  }, [context, handler])
}

export const IssueModalRouteShell = ({ children }: { children: ReactNode }) => {
  const router = useRouter()
  const fallbackClose = useCallback(() => router.back(), [router])
  const closeHandlerRef = useRef<CloseHandler>(fallbackClose)

  const registerCloseHandler = useCallback(
    (handler: CloseHandler) => {
      closeHandlerRef.current = handler

      return () => {
        if (closeHandlerRef.current === handler) {
          closeHandlerRef.current = fallbackClose
        }
      }
    },
    [fallbackClose]
  )
  const navigationContext = useMemo(
    () => ({ registerCloseHandler }),
    [registerCloseHandler]
  )
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) closeHandlerRef.current()
  }, [])

  return (
    <IssueModalNavigationContext.Provider value={navigationContext}>
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent
          className="h-[calc(100svh-1rem)] max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] gap-0 overflow-hidden rounded-3xl p-0 sm:h-[calc(100svh-2rem)] sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-5xl sm:rounded-4xl"
          aria-describedby="issue-modal-route-description"
        >
          <DialogTitle className="sr-only">Issue details</DialogTitle>
          <DialogDescription
            id="issue-modal-route-description"
            className="sr-only"
          >
            Review and update this issue without leaving the issues list.
          </DialogDescription>
          <div className="h-full min-h-0 overflow-y-scroll p-4 [scrollbar-gutter:stable] sm:p-6">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </IssueModalNavigationContext.Provider>
  )
}
