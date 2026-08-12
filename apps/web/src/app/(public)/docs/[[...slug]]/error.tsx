"use client"

import { useEffect, useRef } from "react"

export default function Error({ reset }: { reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <main
      data-route-boundary="true"
      data-boundary-state="error"
      className="mx-auto flex min-h-96 w-full max-w-lg flex-col justify-center gap-5"
      role="alert"
    >
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-semibold outline-none"
      >
        Documentation could not be loaded
      </h1>
      <p className="text-muted-foreground">
        Try loading this page again. No account or document changes were made.
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-4xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        Try again
      </button>
    </main>
  )
}
