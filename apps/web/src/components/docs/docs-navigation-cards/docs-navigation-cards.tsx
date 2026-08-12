import FumaLink from "fumadocs-core/link"
import type { Root } from "fumadocs-core/page-tree"
import { ArrowUpRightIcon } from "lucide-react"
import type { ReactNode } from "react"

export const DocsNavigationCards = ({ tree }: { tree: Root }) => {
  const cards = getCards(tree)

  return (
    <div className="mb-10 grid gap-3 sm:grid-cols-2" data-docs-navigation-cards>
      {cards.map((card) => (
        <FumaLink
          key={card.url}
          href={card.url}
          className="group rounded-2xl border bg-card p-5 text-card-foreground shadow-xs transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
          data-docs-card
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary [&>svg]:size-5">
            {card.icon}
          </span>
          <span className="mt-4 flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">{card.name}</span>
              {card.description ? (
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                  {card.description}
                </span>
              ) : null}
            </span>
            <ArrowUpRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
        </FumaLink>
      ))}
    </div>
  )
}

type DocsCard = {
  description?: string
  icon?: ReactNode
  name: string
  url: string
}

const getCards = (tree: Root): DocsCard[] => {
  const cards: DocsCard[] = []

  for (const node of tree.children) {
    if (node.type === "folder" && node.index) {
      cards.push({
        description: getDescription(node.description ?? node.index.description),
        icon: node.icon ?? node.index.icon,
        name: String(node.name),
        url: node.index.url,
      })
      continue
    }

    if (node.type === "page" && node.url === "/docs/privacy") {
      cards.push({
        description: getDescription(node.description),
        icon: node.icon,
        name: String(node.name),
        url: node.url,
      })
    }
  }

  return cards
}

const getDescription = (description: ReactNode): string | undefined =>
  description ? String(description) : undefined
