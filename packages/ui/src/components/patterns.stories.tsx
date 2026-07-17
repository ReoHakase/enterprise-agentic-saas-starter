import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersRoundIcon,
} from "lucide-react"
import { type FormEvent, useCallback } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import { Badge } from "./badge"
import { Button } from "./button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"
import { Field, FieldGroup, FieldLabel } from "./field"
import { Input } from "./input"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

const members = [
  { name: "Avery Stone", email: "avery@example.com", role: "Super Admin" },
  { name: "Jordan Lee", email: "jordan@example.com", role: "Admin" },
  { name: "Kai Brooks", email: "kai@example.com", role: "Member" },
]
const dialogTriggerButtonRender = <Button />

const SidebarPattern = () => (
  <div className="h-136 w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border">
    <SidebarProvider className="min-h-full" defaultOpen>
      <Sidebar
        data-testid="workspace-sidebar"
        collapsible="icon"
        className="absolute h-136"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Acme Cloud">
                <span className="flex size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                  A
                </span>
                <span className="grid text-left">
                  <span className="font-semibold">Acme Cloud</span>
                  <span className="text-xs text-muted-foreground">
                    Team workspace
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Overview">
                    <LayoutDashboardIcon aria-hidden="true" />
                    <span>Overview</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Issues">
                    <ListChecksIcon aria-hidden="true" />
                    <span>Issues</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Members">
                    <UsersRoundIcon aria-hidden="true" />
                    <span>Members</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Avery Stone">
                <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs">
                  AS
                </span>
                <span>Avery Stone</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-full">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <SidebarTrigger />
          <span className="font-medium">Overview</span>
        </header>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            ["Open issues", "18"],
            ["Members", "12"],
            ["Pending invites", "2"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </SidebarInset>
    </SidebarProvider>
  </div>
)

const MembersPattern = ({
  onInvite,
}: {
  onInvite: (email: string) => void
}) => {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      onInvite(String(form.get("email")))
    },
    [onInvite]
  )

  return (
    <div className="w-[min(46rem,calc(100vw-2rem))] rounded-2xl border bg-card p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Organization members</h2>
          <p className="text-sm text-muted-foreground">
            Roles apply only to this tenant.
          </p>
        </div>
        <Dialog>
          <DialogTrigger render={dialogTriggerButtonRender}>
            Invite member
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Invite member</DialogTitle>
                <DialogDescription>
                  Send access to a verified email address.
                </DialogDescription>
              </DialogHeader>
              <FieldGroup className="py-5">
                <Field>
                  <FieldLabel htmlFor="story-invite-email">Email</FieldLabel>
                  <Input
                    id="story-invite-email"
                    name="email"
                    type="email"
                    placeholder="teammate@example.com"
                    required
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button type="submit">Send invitation</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <Table aria-label="Organization members">
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.email}>
              <TableCell>
                <p className="font-medium">{member.name}</p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{member.role}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const meta = {
  title: "Patterns/SaaS Console",
  component: SidebarPattern,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof SidebarPattern>

export default meta
type Story = StoryObj<typeof meta>

export const ResponsiveSidebar: Story = {
  play: async ({ canvasElement }) => {
    const sidebar = canvasElement.querySelector(
      '[data-slot="sidebar"][data-state]'
    )
    if (!sidebar) {
      throw new Error("Sidebar state container was not rendered")
    }
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
    await expect(
      within(canvasElement).getByRole("button", {
        name: "Overview",
      })
    ).toBeVisible()
    await userEvent.keyboard("{Control>}b{/Control}")
    await expect(sidebar).toHaveAttribute("data-state", "collapsed")
    await userEvent.keyboard("{Control>}b{/Control}")
    await expect(sidebar).toHaveAttribute("data-state", "expanded")
  },
}

export const MemberTableAndDialog: StoryObj<typeof MembersPattern> = {
  render: (args) => <MembersPattern {...args} />,
  args: { onInvite: fn() },
  play: async ({ args, canvas }) => {
    await expect(canvas.getByRole("table")).toHaveAccessibleName(
      "Organization members"
    )
    await expect(canvas.getAllByRole("row")).toHaveLength(members.length + 1)
    await userEvent.click(canvas.getByRole("button", { name: "Invite member" }))
    const body = within(document.body)
    await expect(
      body.getByRole("dialog", { name: "Invite member" })
    ).toHaveAccessibleDescription("Send access to a verified email address.")
    await userEvent.type(
      body.getByRole("textbox", { name: "Email" }),
      "new-member@example.com"
    )
    await userEvent.click(body.getByRole("button", { name: "Send invitation" }))
    await expect(args.onInvite).toHaveBeenCalledWith("new-member@example.com")
  },
}
