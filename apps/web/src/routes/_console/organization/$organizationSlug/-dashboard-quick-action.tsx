import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"

export const QuickAction = ({
  number,
  title,
  description,
  href,
}: {
  number: string
  title: string
  description: string
  href: string
}) => (
  <Link
    to={href}
    className="group flex items-center gap-4 rounded-xl border p-4 transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30"
  >
    <span className="text-xs font-medium text-muted-foreground">{number}</span>
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="block text-sm text-muted-foreground">{description}</span>
    </span>
    <ArrowRightIcon aria-hidden="true" />
  </Link>
)
