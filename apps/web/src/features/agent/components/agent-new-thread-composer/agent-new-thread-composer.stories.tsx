import { fn } from "storybook/test"

import preview from "#storybook/preview"

import {
  AgentStoryScope,
  fictionalAgentIdentity,
} from "../../test-support/fixtures"
import { AgentNewThreadComposer } from "./agent-new-thread-composer"

const createThread = fn()

const meta = preview.meta({
  title: "Web/Agent/New Thread Composer",
  component: AgentNewThreadComposer,
  tags: ["autodocs"],
  args: {
    creating: false,
    disabled: false,
    onCreate: createThread,
    organizationId: fictionalAgentIdentity.organizationId,
  },
  decorators: [
    (Story) => (
      <AgentStoryScope>
        <div className="flex min-h-160 max-w-3xl">
          <Story />
        </div>
      </AgentStoryScope>
    ),
  ],
})

export const Ready = meta.story({
  tags: ["theme-sensitive"],
})

export const Creating = meta.story({
  args: { creating: true },
})
