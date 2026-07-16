"use client"

import { createContext, useContext } from "react"

export const IssueMutationContext = createContext<string | undefined>(undefined)

export const useIssueMutationState = (issueId: string) =>
  useContext(IssueMutationContext) === issueId
