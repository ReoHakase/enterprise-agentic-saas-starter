import Link from "fumadocs-core/link"
import type { Node, Root } from "fumadocs-core/page-tree"

export const DocsSidebar = ({ tree }: { tree: Root }) => (
  <nav aria-label="Documentation navigation" className="text-sm">
    <ul className="space-y-1">
      {tree.children.map((node) => (
        <DocsSidebarNode key={node.$id ?? getNodeKey(node)} node={node} />
      ))}
    </ul>
  </nav>
)

const DocsSidebarNode = ({ node }: { node: Node }) => {
  if (node.type === "page") {
    return (
      <li>
        <Link
          href={node.url}
          external={node.external}
          className="block rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {node.name}
        </Link>
      </li>
    )
  }

  if (node.type === "separator") {
    return (
      <li className="px-3 pt-5 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {node.name}
      </li>
    )
  }

  const children = node.index ? [node.index, ...node.children] : node.children
  const content = (
    <ul className="mt-1 space-y-1 border-l pl-3">
      {children.map((child) => (
        <DocsSidebarNode key={child.$id ?? getNodeKey(child)} node={child} />
      ))}
    </ul>
  )

  if (node.collapsible === false) {
    return (
      <li>
        <p className="px-3 py-2 font-medium text-foreground">{node.name}</p>
        {content}
      </li>
    )
  }

  return (
    <li>
      <details open={node.defaultOpen ?? node.root}>
        <summary className="cursor-pointer rounded-lg px-3 py-2 font-medium text-foreground hover:bg-muted">
          {node.name}
        </summary>
        {content}
      </details>
    </li>
  )
}

const getNodeKey = (node: Node): string => {
  if (node.type === "page") return node.url
  if (node.type === "folder") return node.$ref?.folder ?? String(node.name)
  return `separator-${String(node.name)}`
}
