"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { Card, CardContent } from "@enterprise-agentic-saas/ui/components/card"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { Textarea } from "@enterprise-agentic-saas/ui/components/textarea"
import { useHotkeys } from "@tanstack/react-hotkeys"
import { ImagePlusIcon, SendIcon } from "lucide-react"
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"

import { AgentSamplePrompts } from "@/features/agent/components/agent-sample-prompts"
import { isAgentHotkeyAllowed } from "@/features/agent/hotkey-scope"

const attachmentButtonRender = <span />

export const AgentNewThreadComposer = ({
  disabled,
  creating,
  onCreate,
}: {
  disabled: boolean
  creating: boolean
  onCreate: (composer: string, files: File[], autoSubmit: boolean) => void
}) => {
  const [composer, setComposer] = useState("")
  const formRef = useRef<HTMLFormElement>(null)
  const changeComposer = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) =>
      setComposer(event.target.value),
    []
  )
  const choosePrompt = useCallback((prompt: string) => setComposer(prompt), [])
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const message = composer.trim()
      if (!message || disabled || creating) return
      onCreate(message, [], true)
    },
    [composer, creating, disabled, onCreate]
  )
  const attach = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])]
      event.target.value = ""
      if (files.length === 0 || disabled || creating) return
      onCreate(composer, files, false)
    },
    [composer, creating, disabled, onCreate]
  )
  useHotkeys(
    [
      {
        hotkey: "Mod+Enter",
        callback: (event) => {
          if (isAgentHotkeyAllowed(event)) formRef.current?.requestSubmit()
        },
        options: {
          enabled: !disabled && !creating,
          ignoreInputs: false,
        },
      },
    ],
    {
      conflictBehavior: "allow",
      meta: { name: "New Agent thread", description: "Send first message" },
    }
  )

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-3 pt-4">
        <div className="min-h-72 flex-1 overflow-y-auto">
          <AgentSamplePrompts onSelect={choosePrompt} />
        </div>
        <form
          ref={formRef}
          className="flex min-w-0 shrink-0 flex-col gap-2"
          onSubmit={submit}
        >
          <Textarea
            className="max-h-[40vh] min-h-24 overflow-y-auto"
            value={composer}
            onChange={changeComposer}
            placeholder="Describe the issue, or attach screenshots for analysis."
            disabled={disabled || creating}
            maxLength={10_000}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Ask each time · permissions can be changed after this thread
              starts.
            </span>
            <span>
              Context 0% · Monthly usage loads after the thread starts.
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex" htmlFor="agent-new-thread-images">
              <Input
                id="agent-new-thread-images"
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={disabled || creating}
                onChange={attach}
              />
              <Button
                render={attachmentButtonRender}
                nativeButton={false}
                type="button"
                variant="outline"
                disabled={disabled || creating}
              >
                <ImagePlusIcon data-icon="inline-start" /> Attach images
              </Button>
            </label>
            <Button type="submit" disabled={disabled || creating}>
              {creating ? <Spinner /> : <SendIcon data-icon="inline-start" />}
              {creating ? "Starting…" : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
