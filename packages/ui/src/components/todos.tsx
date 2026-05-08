"use client"

import {
  Check,
  CircleIcon,
  ClipboardListIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react"
import { useCallback, type ChangeEvent, type FormEvent } from "react"

import { cn } from "../lib/utils"
import { Badge } from "./badge"
import { Button } from "./button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card"
import { Checkbox } from "./checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./empty"
import { Input } from "./input"

export type TodoUiItem = {
  id: string
  title: string
  completed: boolean
}

export type TodoWorkspaceProps = {
  todos: TodoUiItem[]
  pending?: boolean
  busyTodoId?: string
  title: string
  onTitleChange: (title: string) => void
  onCreate: () => void
  onToggle: (todo: TodoUiItem) => void
  onDelete: (todo: TodoUiItem) => void
}

export const TodoWorkspace = ({
  todos,
  pending,
  busyTodoId,
  title,
  onTitleChange,
  onCreate,
  onToggle,
  onDelete,
}: TodoWorkspaceProps) => {
  const completedCount = todos.filter((todo) => todo.completed).length
  const openCount = todos.length - completedCount
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onCreate()
    },
    [onCreate]
  )
  const handleTitleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onTitleChange(event.target.value)
    },
    [onTitleChange]
  )

  return (
    <section className="grid w-full max-w-full min-w-0 gap-5 overflow-hidden">
      <div className="grid min-w-0 gap-4 md:grid-cols-3">
        <TodoMetricCard label="Open" value={openCount} />
        <TodoMetricCard label="Done" value={completedCount} />
        <TodoMetricCard label="Total" value={todos.length} />
      </div>

      <Card className="border-foreground/10 bg-card/85">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-4xl bg-primary/10 text-primary">
            <ClipboardListIcon aria-hidden="true" />
          </div>
          <CardTitle>Task intake</CardTitle>
          <CardDescription>Capture the next operational task.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={handleSubmit}
          >
            <Input
              value={title}
              onChange={handleTitleChange}
              placeholder="New todo"
              aria-label="New todo"
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              disabled={pending || title.trim().length === 0}
              className="shrink-0"
            >
              {pending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-3">
        {todos.length === 0 ? (
          <Card className="border-dashed bg-card/70">
            <CardContent className="py-10">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No todos yet</EmptyTitle>
                  <EmptyDescription>
                    Add the first task for this organization.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              busy={busyTodoId === todo.id}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  )
}

const TodoMetricCard = ({ label, value }: { label: string; value: number }) => (
  <Card size="sm" className="min-w-0 border-foreground/10 bg-card/80">
    <CardHeader>
      <CardTitle>{label}</CardTitle>
      <CardAction>
        <Badge variant="secondary" className="rounded-4xl">
          Todo
        </Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-semibold tracking-normal">{value}</p>
    </CardContent>
  </Card>
)

type TodoRowProps = {
  todo: TodoUiItem
  busy: boolean
  onToggle: (todo: TodoUiItem) => void
  onDelete: (todo: TodoUiItem) => void
}

const TodoRow = ({ todo, busy, onToggle, onDelete }: TodoRowProps) => {
  const handleToggle = useCallback(() => {
    onToggle(todo)
  }, [onToggle, todo])
  const handleDelete = useCallback(() => {
    onDelete(todo)
  }, [onDelete, todo])

  return (
    <Card
      size="sm"
      className="min-w-0 overflow-hidden border-foreground/10 bg-card/85"
    >
      <CardContent className="flex min-w-0 items-center gap-3 py-3">
        <Checkbox
          checked={todo.completed}
          disabled={busy}
          onCheckedChange={handleToggle}
          aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            todo.completed && "text-muted-foreground line-through"
          )}
        >
          {todo.title}
        </span>
        {todo.completed ? (
          <Badge variant="secondary" className="shrink-0 rounded-4xl">
            <Check />
            Done
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 rounded-4xl">
            <CircleIcon />
            Open
          </Badge>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={handleDelete}
          aria-label="Delete todo"
          className="shrink-0"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </CardContent>
    </Card>
  )
}
