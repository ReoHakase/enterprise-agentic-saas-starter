import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { ArrowLeftIcon, FileQuestionIcon } from "lucide-react"
import Link from "next/link"

import { AppState } from "@/components/app-state"

export default function NotFound() {
  return (
    <AppState
      icon={FileQuestionIcon}
      title="Page not found"
      description="The address may be outdated, or the resource may not be available in the active organization."
      actions={
        <Button nativeButton={false} render={<Link href="/dashboard" />}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          Back to dashboard
        </Button>
      }
    />
  )
}
