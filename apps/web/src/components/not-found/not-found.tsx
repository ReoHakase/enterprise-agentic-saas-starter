import { ArrowLeftIcon, FileQuestionIcon } from "lucide-react"

import { AppState } from "@/components/app-state/app-state"
import { LinkButton } from "@/components/link-button/link-button"

export const NotFound = () => (
  <AppState
    icon={FileQuestionIcon}
    title="Page not found"
    description="The address may be outdated, or the resource may not be available in the active organization."
  >
    <LinkButton href="/dashboard">
      <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
      Back to dashboard
    </LinkButton>
  </AppState>
)
