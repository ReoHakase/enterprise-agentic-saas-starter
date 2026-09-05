import { AgentFormRegistryProvider } from "@/features/agent"

import { IssuesWorkspace } from "../components/issues-workspace/issues-workspace"
import type { IssuesWorkspaceProps } from "../components/types"
import { issuesWorkspaceStoryDefaultProps } from "./issues-workspace-story-data"

export const IssuesWorkspaceStoryFixture = (
  props: Partial<IssuesWorkspaceProps>
) => (
  <AgentFormRegistryProvider>
    <IssuesWorkspace {...issuesWorkspaceStoryDefaultProps} {...props} />
  </AgentFormRegistryProvider>
)
