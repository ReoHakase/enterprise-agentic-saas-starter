import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import type { LucideIcon } from "lucide-react"

export const MetricCard = ({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: number
  description: string
  icon: LucideIcon
}) => (
  <Card size="sm">
    <CardHeader>
      <CardDescription>{title}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      <CardAction>
        <Icon aria-hidden="true" />
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-xs text-muted-foreground capitalize">{description}</p>
    </CardContent>
  </Card>
)
