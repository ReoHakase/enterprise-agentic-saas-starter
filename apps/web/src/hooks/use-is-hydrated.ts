"use client"

import { useSyncExternalStore } from "react"

const noop = () => undefined
const subscribe = () => noop
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * Keep server-rendered controls inert until React owns their state.
 *
 * `useSyncExternalStore` gives the hydration render the same `false` snapshot
 * as SSR, then switches to the client snapshot without an effect-driven state
 * update.
 */
export const useIsHydrated = () =>
  useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
