import type { Meta, StoryObj } from "@storybook/react-vite"
import {
  LayoutDashboardIcon,
  ListChecksIcon,
  UsersRoundIcon,
} from "lucide-react"
import { type FormEvent, useCallback } from "react"
import { expect, fn, userEvent, within } from "storybook/test"

import { Badge } from "../badge/badge"
import { Button } from "../button/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "../dialog/dialog"
import { Field, FieldGroup, FieldLabel } from "../field/field"
import { Input } from "../input/input"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "../sidebar-structure/sidebar-structure"
import {
  Sidebar,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "../sidebar/sidebar"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../table/table"

const members = [
  { name: "Avery Stone", email: "avery@example.com", role: "Super Admin" },
  { name: "Jordan Lee", email: "jordan@example.com", role: "Admin" },
  { name: "Kai Brooks", email: "kai@example.com", role: "Member" },
]
const dialogTriggerButtonRender = <Button />
const dialogCloseButtonRender = <Button type="button" variant="outline" />

const SidebarPattern = () => (
  <div className="h-136 w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border">
    <SidebarProvider className="min-h-full" defaultOpen>
      <Sidebar
        data-testid="workspace-sidebar"
        collapsible="icon"
        className="absolute h-136"
      >
        <SidebarHeader>
          <SidebarInput aria-label="Search navigation" placeholder="Search" />
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
            <SidebarGroupAction aria-label="Add workspace shortcut">
              +
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Overview">
                    <LayoutDashboardIcon aria-hidden="true" />
                    <span>Overview</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                  <SidebarMenuAction aria-label="Overview actions">
                    ···
                  </SidebarMenuAction>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Issues">
                    <ListChecksIcon aria-hidden="true" />
                    <span>Issues</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton href="#open">
                        Open issues
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Members">
                    <UsersRoundIcon aria-hidden="true" />
                    <span>Members</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator />
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
        <SidebarRail />
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
                <DialogClose render={dialogCloseButtonRender}>
                  Cancel
                </DialogClose>
                <Button type="submit">Send invitation</Button>
              </DialogFooter>
            </form>
          </DialogContent>
          <DialogPortal>
            <DialogOverlay className="pointer-events-none bg-transparent backdrop-blur-none" />
          </DialogPortal>
        </Dialog>
      </div>
      <Table aria-label="Organization members">
        <TableCaption>Current organization membership</TableCaption>
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
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>{members.length} members</TableCell>
          </TableRow>
        </TableFooter>
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
    await expect(canvas.getAllByRole("row")).toHaveLength(members.length + 2)
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
