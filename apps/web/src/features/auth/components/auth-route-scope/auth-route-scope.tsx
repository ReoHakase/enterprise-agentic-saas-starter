"use client"

import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react"

import type { AuthRouteState } from "./auth-route-href"

export type { AuthRouteState } from "./auth-route-href"

const AuthRouteContext = createContext<AuthRouteState | undefined>(undefined)

export const AuthRouteScope = ({
  addingAccount,
  children,
  reauthenticating,
  redirectTo,
}: PropsWithChildren<AuthRouteState>) => {
  const value = useMemo<AuthRouteState>(
    () => ({ addingAccount, reauthenticating, redirectTo }),
    [addingAccount, reauthenticating, redirectTo]
  )

  return (
    <AuthRouteContext.Provider value={value}>
      {children}
    </AuthRouteContext.Provider>
  )
}

export const useAuthRouteState = () => useContext(AuthRouteContext)
