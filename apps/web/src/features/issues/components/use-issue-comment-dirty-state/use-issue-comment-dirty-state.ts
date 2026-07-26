"use client"

import { useCallback, useRef, useState } from "react"

export const useIssueCommentDirtyState = () => {
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set())
  const handlers = useRef(new Map<string, (dirty: boolean) => void>())
  const handleDirtyChange = useCallback((commentId: string, dirty: boolean) => {
    setDirtyIds((current) => {
      const next = new Set(current)
      if (dirty) next.add(commentId)
      else next.delete(commentId)
      return next
    })
  }, [])
  const getDirtyHandler = useCallback(
    (commentId: string) => {
      const existing = handlers.current.get(commentId)
      if (existing) return existing
      const handler = (dirty: boolean) => handleDirtyChange(commentId, dirty)
      handlers.current.set(commentId, handler)
      return handler
    },
    [handleDirtyChange]
  )

  return { dirtyIds, getDirtyHandler }
}
