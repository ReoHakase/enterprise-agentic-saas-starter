"use client"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@enterprise-agentic-saas/ui/components/sidebar"
import { useLocation } from "@tanstack/react-router"
import type { Node, Root } from "fumadocs-core/page-tree"
import type { ReactNode } from "react"

import {
  NavigationLinkBridge,
  SidebarMenuLinkButton,
} from "@/components/navigation-link/navigation-link"

const nextLinkRender = <NavigationLinkBridge />
const menuLabelRender = <div />
const subMenuLabelRender = <div />

export const Sidebar = ({ tree }: { tree: Root }) => {
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <nav aria-label="Documentation navigation" data-docs-sidebar>
      <SidebarGroup className="pt-0">
        <SidebarGroupLabel>Documentation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {tree.children.map((node) => (
              <SidebarNode
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

const SidebarNode = ({ node, pathname }: { node: Node; pathname: string }) => {
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
      {indexUrl ? (
        <SidebarMenuLinkButton
          href={indexUrl}
          isActive={indexUrl === pathname}
          tooltip={String(node.name)}
          aria-current={pathname === indexUrl ? "page" : undefined}
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuLinkButton>
      ) : (
        <SidebarMenuButton
          render={menuLabelRender}
          className="cursor-default hover:bg-transparent hover:text-sidebar-foreground"
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuButton>
      )}
      <SidebarMenuSub>
        {children.map((child) => (
          <SidebarSubNode
            key={child.$id ?? getNodeKey(child)}
            node={child}
            pathname={pathname}
          />
        ))}
      </SidebarMenuSub>
    </SidebarMenuItem>
  )
}

const SidebarSubNode = ({
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
  const indexUrl = node.index?.url

  return (
    <SidebarMenuSubItem>
      {indexUrl ? (
        <SidebarMenuSubButton
          render={nextLinkRender}
          href={indexUrl}
          isActive={indexUrl === pathname}
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuSubButton>
      ) : (
        <SidebarMenuSubButton
          render={subMenuLabelRender}
          className="cursor-default hover:bg-transparent hover:text-sidebar-foreground"
        >
          <NodeIcon icon={node.icon} />
          <span>{node.name}</span>
        </SidebarMenuSubButton>
      )}
      <SidebarMenuSub>
        {children.map((child) => (
          <SidebarSubNode
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
