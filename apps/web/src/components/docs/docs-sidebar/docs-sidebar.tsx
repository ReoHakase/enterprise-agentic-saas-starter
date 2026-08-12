"use client"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import type { Node, Root } from "fumadocs-core/page-tree"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentProps, ReactNode } from "react"

import { SidebarMenuLinkButton } from "@/components/navigation-link/navigation-link"

type DocsNavigationLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href?: ComponentProps<typeof Link>["href"]
}

const DocsNavigationLink = ({ href, ...props }: DocsNavigationLinkProps) => {
  if (!href) throw new Error("DocsNavigationLink requires an href")
  return <Link href={href} {...props} />
}

const nextLinkRender = <DocsNavigationLink />

export const DocsSidebar = ({ tree }: { tree: Root }) => {
  const pathname = usePathname()

  return (
    <nav aria-label="Documentation navigation" data-docs-sidebar>
      <SidebarGroup className="pt-0">
        <SidebarGroupLabel>Documentation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {tree.children.map((node) => (
              <DocsSidebarNode
                key={node.$id ?? getNodeKey(node)}
                node={node}
                pathname={pathname}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  )
}

const DocsSidebarNode = ({
  node,
  pathname,
}: {
  node: Node
  pathname: string
}) => {
  if (node.type === "page") {
    return (
      <SidebarMenuItem>
        <SidebarMenuLinkButton
          href={node.url}
          isActive={pathname === node.url}
          tooltip={String(node.name)}
          aria-current={pathname === node.url ? "page" : undefined}
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuLinkButton>
      </SidebarMenuItem>
    )
  }

  if (node.type === "separator") {
    return <SidebarGroupLabel>{node.name}</SidebarGroupLabel>
  }

  const children = node.children
  const indexUrl = node.index?.url

  return (
    <SidebarMenuItem>
      <SidebarMenuLinkButton
        href={indexUrl ?? "/docs"}
        isActive={indexUrl === pathname}
        tooltip={String(node.name)}
        aria-current={pathname === indexUrl ? "page" : undefined}
      >
        <NodeIcon icon={node.icon} />
        <span>{node.name}</span>
      </SidebarMenuLinkButton>
      <SidebarMenuSub>
        {children.map((child) => (
          <DocsSidebarSubNode
            key={child.$id ?? getNodeKey(child)}
            node={child}
            pathname={pathname}
          />
        ))}
      </SidebarMenuSub>
    </SidebarMenuItem>
  )
}

const DocsSidebarSubNode = ({
  node,
  pathname,
}: {
  node: Node
  pathname: string
}) => {
  if (node.type === "page") {
    const isActive = pathname === node.url

    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton
          render={nextLinkRender}
          href={node.url}
          isActive={isActive}
          aria-current={isActive ? "page" : undefined}
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    )
  }

  if (node.type === "separator") {
    return (
      <li className="px-3 py-1 text-xs text-muted-foreground">{node.name}</li>
    )
  }

  const children = node.children

  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        render={nextLinkRender}
        href={node.index?.url}
        isActive={node.index?.url === pathname}
      >
        <NodeIcon icon={node.icon} />
        <span>{node.name}</span>
      </SidebarMenuSubButton>
      <SidebarMenuSub>
        {children.map((child) => (
          <DocsSidebarSubNode
            key={child.$id ?? getNodeKey(child)}
            node={child}
            pathname={pathname}
          />
        ))}
      </SidebarMenuSub>
    </SidebarMenuSubItem>
  )
}

const NodeIcon = ({ icon }: { icon?: ReactNode }) => (
  <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
    {icon}
  </span>
)

const getNodeKey = (node: Node): string => {
  if (node.type === "page") return node.url
  if (node.type === "folder") return node.$ref?.folder ?? String(node.name)
  return `separator-${String(node.name)}`
}
