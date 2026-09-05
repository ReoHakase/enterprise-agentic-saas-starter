import { useRouterState } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import {
  onRouterTransitionStart,
  registerClientObservability,
} from "@/instrumentation-client"

export const RouterTelemetry = () => {
  const href = useRouterState({ select: (state) => state.location.href })
  const previousHref = useRef(href)

  useEffect(() => {
    registerClientObservability()
  }, [])

  useEffect(() => {
    if (previousHref.current !== href) {
      onRouterTransitionStart(href, "navigate")
      previousHref.current = href
    }
  }, [href])

  return null
}
