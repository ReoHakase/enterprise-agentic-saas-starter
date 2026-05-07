"use client"

import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import {
  useCallback,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card"
import { Checkbox } from "./checkbox"
import { Input } from "./input"
import { Label } from "./label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

export type TodoUiOrganization = {
  id: string
  name: string
  role: string
}

export type TodoUiItem = {
  id: string
  title: string
  completed: boolean
}

export type TodoWorkspaceProps = {
  organizations: TodoUiOrganization[]
  selectedOrganizationId: string
  todos: TodoUiItem[]
  pending?: boolean
  busyTodoId?: string
  title: string
  userLabel: string
  children?: ReactNode
  onOrganizationChange: (organizationId: string) => void
  onTitleChange: (title: string) => void
  onCreate: () => void
  onToggle: (todo: TodoUiItem) => void
  onDelete: (todo: TodoUiItem) => void
}

export const TodoWorkspace = ({
  organizations,
  selectedOrganizationId,
  todos,
  pending,
  busyTodoId,
  title,
  userLabel,
  children,
  onOrganizationChange,
  onTitleChange,
  onCreate,
  onToggle,
  onDelete,
}: TodoWorkspaceProps) => {
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrganizationId
  )

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      onCreate()
    },
    [onCreate]
  )
  const handleOrganizationChange = useCallback(
    (organizationId: string | null) => {
      if (organizationId) {
        onOrganizationChange(organizationId)
      }
    },
    [onOrganizationChange]
  )
  const handleTitleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onTitleChange(event.target.value)
    },
    [onTitleChange]
  )

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8">
        <header className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{userLabel}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal">
              Todos
            </h1>
          </div>
          {children}
        </header>

        {organizations.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Organization required</CardTitle>
              <CardDescription>
                Your account is not attached to an organization.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-3">
              <Label htmlFor="organization">Organization</Label>
              <Select
                value={selectedOrganizationId}
                onValueChange={handleOrganizationChange}
              >
                <SelectTrigger id="organization" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((organization) => (
                    <SelectItem key={organization.id} value={organization.id}>
                      {organization.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrganization ? (
                <p className="text-sm text-muted-foreground">
                  {selectedOrganization.role}
                </p>
              ) : null}
            </aside>

            <section className="flex min-w-0 flex-col gap-4">
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
                  {pending ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add
                </Button>
              </form>

              <div className="flex flex-col gap-2">
                {todos.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">
                      No todos yet.
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
          </div>
        )}
      </div>
    </main>
  )
}

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
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-3">
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
          <Check className="size-4 text-muted-foreground" />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={handleDelete}
          aria-label="Delete todo"
        >
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </CardContent>
    </Card>
  )
}
