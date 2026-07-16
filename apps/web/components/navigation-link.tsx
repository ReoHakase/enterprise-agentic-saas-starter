"use client"

import { DropdownMenuItem } from "@enterprise-agentic-saas/ui/components/dropdown-menu"
import { SidebarMenuButton } from "@enterprise-agentic-saas/ui/components/sidebar"
import Link from "next/link"
import type { ComponentProps } from "react"

type LinkHref = ComponentProps<typeof Link>["href"]

type NavigationLinkBridgeProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: LinkHref
  nativeButton?: boolean
}

const NavigationLinkBridge = ({
  href,
  nativeButton: _nativeButton,
  ...props
}: NavigationLinkBridgeProps) => {
  if (!href) {
    throw new Error("NavigationLinkBridge requires an href")
  }

  return <Link href={href} {...props} />
}

// The element intentionally has no `href`: Base UI merges call-site props into
// this bridge, and a placeholder href on the element would win that merge.
const nextLinkRender = <NavigationLinkBridge />

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
    render: nextLinkRender,
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
    render: nextLinkRender,
  }

  return <SidebarMenuButton {...linkProps} />
}
