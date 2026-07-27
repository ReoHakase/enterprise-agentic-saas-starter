"use client"

import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  ArchiveIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"

import { LocalDate } from "@/components/local-date/local-date"

import type { AgentThread } from "../../schema"

export const AgentThreadToolbar = ({
  threads,
  selectedThread,
  loading,
  error,
  creating,
  archiving,
  disabled,
  onSelect,
  onCreate,
  onArchive,
}: {
  threads: AgentThread[]
  selectedThread?: AgentThread
  loading: boolean
  error: boolean
  creating: boolean
  archiving: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onCreate: () => void
  onArchive: (threadId: string) => void
}) => {
  const items = useMemo(
    () => threads.map((thread) => ({ label: thread.title, value: thread.id })),
    [threads]
  )
  const selectThread = useCallback(
    (threadId: string | null) => {
      if (threadId) onSelect(threadId)
    },
    [onSelect]
  )
  const archiveThread = useCallback(() => {
    if (selectedThread) onArchive(selectedThread.id)
  }, [onArchive, selectedThread])
  return (
    <div className="shrink-0 space-y-2 rounded-xl border bg-card p-2">
      <div className="flex min-w-0 items-center gap-2">
        <Select
          items={items}
          value={selectedThread?.id ?? ""}
          disabled={disabled || loading || threads.length === 0}
          onValueChange={selectThread}
        >
          <SelectTrigger className="min-w-0 flex-1" aria-label="Agent thread">
            <MessageSquareIcon aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">
              {selectedThread?.title ??
                (loading ? "Loading threads…" : "New conversation")}
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {threads.map((thread) => (
                <SelectItem key={thread.id} value={thread.id}>
                  <div className="min-w-0 py-0.5">
                    <span className="block truncate">{thread.title}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <LocalDate value={thread.updatedAt} includeTime />
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          aria-label="New agent thread"
          disabled={disabled || creating}
          onClick={onCreate}
        >
          {creating ? (
            <Spinner />
          ) : (
            <MessageSquarePlusIcon aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          aria-label={
            selectedThread
              ? `Archive ${selectedThread.title}`
              : "Archive thread"
          }
          disabled={disabled || archiving || !selectedThread}
          onClick={archiveThread}
        >
          <ArchiveIcon aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          Agent threads could not be loaded.
        </p>
      ) : null}
      {!loading && !error && threads.length === 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          Create a private thread to start.
        </p>
      ) : null}
    </div>
  )
}

export const AgentThreadItem = ({
  thread,
  selected,
  disabled,
  onSelect,
  onArchive,
}: {
  thread: AgentThread
  selected: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onArchive: (threadId: string) => void
}) => {
  const select = useCallback(() => onSelect(thread.id), [onSelect, thread.id])
  const archive = useCallback(
    () => onArchive(thread.id),
    [onArchive, thread.id]
  )
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        className="min-w-0 flex-1 justify-start"
        variant={selected ? "secondary" : "ghost"}
        disabled={disabled}
        onClick={select}
      >
        <span className="truncate">{thread.title}</span>
      </Button>
      <Button
        size="icon-sm"
        variant="destructive"
        aria-label={`Archive ${thread.title}`}
        disabled={disabled}
        onClick={archive}
      >
        <ArchiveIcon />
      </Button>
    </div>
  )
}
