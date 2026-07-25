import { http, HttpResponse } from "msw"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

import preview from "#storybook/preview"

import {
  fictionalAgentIdentity,
  fictionalPrimaryAgentThread,
} from "../../test-support/fixtures"
import {
  AgentPermissionSelect,
  AgentPolicyControl,
} from "./agent-policy-control"

const modeChanged = fn()

const PermissionExample = ({ disabled = false }: { disabled?: boolean }) => (
  <AgentPermissionSelect
    disabled={disabled}
    mode="ask_always"
    onModeChange={modeChanged}
  />
)

const meta = preview.meta({
  title: "Web/Agent/Permission",
  component: PermissionExample,
  tags: ["autodocs"],
})

export const AskAlways = meta.story({
  tags: ["theme-sensitive"],
  beforeEach() {
    modeChanged.mockClear()
  },
  play: async ({ canvas, step }) => {
    const body = within(document.body)

    await step("Select full access with the keyboard", async () => {
      const trigger = canvas.getByRole("combobox", {
        name: "Agent permission",
      })
      await userEvent.click(trigger)
      await body.findByRole("listbox")
      await userEvent.keyboard("{End}{Enter}")
      await expect(modeChanged).toHaveBeenCalledWith("full_access")
      await waitFor(() =>
        expect(body.queryByRole("listbox")).not.toBeInTheDocument()
      )
    })
  },
})

export const Disabled = meta.story({
  render: () => <PermissionExample disabled />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Agent permission" })
    ).toBeDisabled()
  },
})

export const SavedPolicy = meta.story({
  beforeEach({ msw }) {
    let mode = "ask_always"
    msw.use(
      http.get("*/agent/threads/:threadId/permission", () =>
        HttpResponse.json({
          mode,
          permissions: {
            createIssue: mode === "full_access",
            updateIssue: mode === "full_access",
            deleteIssue: mode === "full_access",
          },
        })
      ),
      http.put("*/agent/threads/:threadId/permission", async ({ request }) => {
        const payload: unknown = await request.json()
        if (payload && typeof payload === "object") {
          const nextMode = Reflect.get(payload, "mode")
          if (nextMode === "ask_always" || nextMode === "full_access") {
            mode = nextMode
          }
        }
        return HttpResponse.json({
          mode,
          permissions: {
            createIssue: true,
            updateIssue: true,
            deleteIssue: true,
          },
        })
      })
    )
  },
  render: () => (
    <AgentPolicyControl
      disabled={false}
      organizationId={fictionalAgentIdentity.organizationId}
      threadId={fictionalPrimaryAgentThread.id}
    />
  ),
  play: async ({ canvas, step }) => {
    await step("Persist a thread-scoped permission", async () => {
      const trigger = canvas.getByRole("combobox", {
        name: "Agent permission",
      })
      await userEvent.click(trigger)
      await userEvent.keyboard("{ArrowDown}{Enter}")
      await expect(await canvas.findByText("Full access")).toBeVisible()
      await waitFor(() =>
        expect(
          within(document.body).queryByRole("listbox")
        ).not.toBeInTheDocument()
      )
    })
  },
})
