import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { CheckCircle2Icon, CircleDotIcon, Clock3Icon } from "lucide-react"

const IssueMetricCard = ({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof CircleDotIcon
}) => (
  <Card size="sm">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      <CardAction>
        <Icon aria-hidden="true" />
      </CardAction>
    </CardHeader>
  </Card>
)

export const IssueMetrics = ({
  open,
  inProgress,
  closed,
}: {
  open: number
  inProgress: number
  closed: number
}) => (
  <>
    <dl
      className="grid grid-cols-3 divide-x rounded-xl border sm:hidden"
      aria-label="Issue status summary"
    >
      <div className="min-w-0 p-3 text-center">
        <dt className="truncate text-xs text-muted-foreground">Open</dt>
        <dd className="mt-1 font-medium tabular-nums">{open}</dd>
      </div>
      <div className="min-w-0 p-3 text-center">
        <dt className="truncate text-xs text-muted-foreground">In progress</dt>
        <dd className="mt-1 font-medium tabular-nums">{inProgress}</dd>
      </div>
      <div className="min-w-0 p-3 text-center">
        <dt className="truncate text-xs text-muted-foreground">Closed</dt>
        <dd className="mt-1 font-medium tabular-nums">{closed}</dd>
      </div>
    </dl>
    <div className="hidden gap-4 sm:grid sm:grid-cols-3">
      <IssueMetricCard label="Open" value={open} icon={CircleDotIcon} />
      <IssueMetricCard
        label="In progress"
        value={inProgress}
        icon={Clock3Icon}
      />
      <IssueMetricCard label="Closed" value={closed} icon={CheckCircle2Icon} />
    </div>
  </>
)
