"use client"

import { useCallback } from "react"

export const boundaryReloadFallbackMs = 1_000

let pendingReloadTimer: number | undefined

/**
 * Let the Next.js boundary recover in place first. If an error boundary is
 * still mounted after the retry window, reload so the RSC request is rebuilt.
 * The DOM check also avoids reloading when reset() recovered or navigation
 * moved the user to another healthy page.
 */
export const useBoundaryRetry = (reset: () => void) =>
  useCallback(() => {
    if (pendingReloadTimer !== undefined) {
      window.clearTimeout(pendingReloadTimer)
    }

    reset()
    pendingReloadTimer = window.setTimeout(() => {
      pendingReloadTimer = undefined
      if (document.querySelector('[data-boundary-state="error"]')) {
        window.location.reload()
      }
    }, boundaryReloadFallbackMs)
  }, [reset])
