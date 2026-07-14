import { atom } from "jotai"

export type SelectedIssueState = {
  organizationId?: string
  issueId?: string
}

export const selectedIssueAtom = atom<SelectedIssueState>({})
