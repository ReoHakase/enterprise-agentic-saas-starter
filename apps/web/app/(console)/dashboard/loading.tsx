import { RouteLoading } from "@/components/app-state"

export default function DashboardLoading() {
  return (
    <RouteLoading
      label="Loading organization dashboard"
      showAction
      variant="dashboard"
    />
  )
}
