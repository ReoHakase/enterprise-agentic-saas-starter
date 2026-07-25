"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import { useCallback } from "react"

const agentSamplePrompts = [
  "Show the most urgent open Issues and explain why they need attention.",
  "Summarize the current page and suggest the next action.",
  "Search the Web for recent guidance relevant to our current Issue.",
] as const

const AgentSamplePrompt = ({
  prompt,
  onSelect,
}: {
  prompt: (typeof agentSamplePrompts)[number]
  onSelect: (prompt: string) => void
}) => {
  const select = useCallback(() => onSelect(prompt), [onSelect, prompt])
  return (
    <Button
      type="button"
      variant="outline"
      className="h-auto justify-start py-3 text-left whitespace-normal"
      onClick={select}
    >
      {prompt}
    </Button>
  )
}

export const AgentSamplePrompts = ({
  onSelect,
}: {
  onSelect: (prompt: string) => void
}) => (
  <section
    className="mx-auto grid w-full max-w-xl gap-2 py-8"
    aria-label="Sample prompts"
  >
    <p className="mb-1 text-center text-sm font-medium">Try an Agent prompt</p>
    {agentSamplePrompts.map((prompt) => (
      <AgentSamplePrompt key={prompt} prompt={prompt} onSelect={onSelect} />
    ))}
  </section>
)
