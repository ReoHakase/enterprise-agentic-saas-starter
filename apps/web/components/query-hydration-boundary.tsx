"use client"

import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query"
import type { PropsWithChildren } from "react"

type QueryHydrationBoundaryProps = PropsWithChildren<{
  state: DehydratedState
}>

export const QueryHydrationBoundary = ({
  children,
  state,
}: QueryHydrationBoundaryProps) => (
  <HydrationBoundary state={state}>{children}</HydrationBoundary>
)
