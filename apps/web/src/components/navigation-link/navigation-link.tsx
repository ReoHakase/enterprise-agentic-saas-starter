"use client"

import { DropdownMenuItem } from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import { SidebarMenuButton } from "@enterprise-agentic-saas/ui/components/sidebar"
import { Link } from "@tanstack/react-router"
import type { ComponentProps } from "react"

type LinkHref = string

type NavigationLinkBridgeProps = Omit<ComponentProps<"a">, "href"> & {
  href?: LinkHref
  nativeButton?: boolean
  prefetch?: boolean
  preload?: ComponentProps<typeof Link>["preload"]
}

export const NavigationLinkBridge = ({
  href,
  nativeButton: _nativeButton,
  prefetch,
  ...props
}: NavigationLinkBridgeProps) => {
  if (!href) {
    throw new Error("NavigationLinkBridge requires an href")
  }

  const preload = prefetch === false ? false : props.preload

  return <Link to={href} {...props} preload={preload} />
}

// The element intentionally has no `href`: Base UI merges call-site props into
// this bridge, and a placeholder href on the element would win that merge.
const routerLinkRender = <NavigationLinkBridge />

type DropdownMenuLinkItemProps = Omit<
  ComponentProps<typeof DropdownMenuItem>,
  "nativeButton" | "render"
> & {
  href: LinkHref
}

export const DropdownMenuLinkItem = ({
  href,
  ...props
}: DropdownMenuLinkItemProps) => {
  const linkProps = {
    ...props,
    href,
    nativeButton: false,
    render: routerLinkRender,
  }

  return <DropdownMenuItem {...linkProps} />
}

type SidebarMenuLinkButtonProps = Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "nativeButton" | "render"
> & {
  href: LinkHref
}

export const SidebarMenuLinkButton = ({
  href,
  ...props
}: SidebarMenuLinkButtonProps) => {
  const linkProps = {
    ...props,
    href,
    nativeButton: false,
    render: routerLinkRender,
  }

  return <SidebarMenuButton {...linkProps} />
}
