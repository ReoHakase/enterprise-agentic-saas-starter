"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@enterprise-agentic-saas/ui/components/alert-dialog"
import {
  Avatar,
  AvatarFallback,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@enterprise-agentic-saas/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@enterprise-agentic-saas/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import { Building2Icon, MailPlusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { browserConsoleApi } from "@/lib/browser/console-api"
import {
  roleLabel,
  type Me,
  type OrganizationDetail,
  type OrganizationInvitation,
  type OrganizationMember,
  type OrganizationRole,
  type OrganizationSummary,
  type UserSession,
} from "@/lib/console-api"
import { clientEnv } from "@/lib/env.client"

const isInvitationRole = (value: string | null): value is "admin" | "member" =>
  value === "admin" || value === "member"

const isOrganizationRole = (value: string | null): value is OrganizationRole =>
  value === "super_admin" || value === "admin" || value === "member"

export const OnboardingForm = () => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await browserConsoleApi.createOrganization({ name, slug })
        router.replace("/dashboard")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <form className="w-full max-w-md" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-name">Name</FieldLabel>
              <Input
                id="organization-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-slug">Slug</FieldLabel>
              <Input
                id="organization-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                required
              />
              <FieldDescription>
                Lowercase letters, numbers, and hyphens.
              </FieldDescription>
            </Field>
            <Button disabled={pending} type="submit">
              <PlusIcon data-icon="inline-start" />
              Create organization
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}

export const ProfileForm = ({ user }: Pick<Me, "user">) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(user.name)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await browserConsoleApi.updateMe({ name })
        toast.success("Profile updated")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-name">Name</FieldLabel>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input value={user.email} readOnly />
              <FieldDescription>
                Email changes are outside this v1.
              </FieldDescription>
            </Field>
            <Button disabled={pending} type="submit">
              Save profile
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}

export const SessionsPanel = ({ sessions }: { sessions: UserSession[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const revoke = (sessionId: string) => {
    startTransition(async () => {
      try {
        await browserConsoleApi.revokeSession(sessionId)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  const revokeOthers = () => {
    startTransition(async () => {
      try {
        await browserConsoleApi.revokeOtherSessions()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={revokeOthers} disabled={pending}>
            Revoke other sessions
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>
                  <div className="font-medium">
                    {session.current ? "Current session" : session.id}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {session.userAgent ?? "Unknown device"}
                  </div>
                </TableCell>
                <TableCell>
                  {new Date(session.updatedAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || session.current}
                    onClick={() => revoke(session.id)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export const OrganizationsPanel = ({
  organizations,
}: {
  organizations: OrganizationSummary[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const activate = (organizationId: string) => {
    startTransition(async () => {
      try {
        await browserConsoleApi.activateOrganization(organizationId)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-3">
          {organizations.map((organization) => (
            <div
              key={organization.id}
              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{organization.name}</p>
                <p className="text-sm text-muted-foreground">
                  {organization.slug} · {roleLabel(organization.role)}
                </p>
              </div>
              <Button
                variant={organization.active ? "secondary" : "outline"}
                disabled={pending || organization.active}
                onClick={() => activate(organization.id)}
              >
                {organization.active ? "Active" : "Switch"}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export const MembersPanel = ({
  organization,
  members,
  invitations,
}: {
  organization: OrganizationDetail
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "member">("member")
  const canManage = organization.permissions.canManageMembers

  const updateRole = (memberId: string, nextRole: OrganizationRole) => {
    startTransition(async () => {
      try {
        await browserConsoleApi.updateMemberRole(
          organization.id,
          memberId,
          nextRole
        )
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  const invite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await browserConsoleApi.createInvitation(organization.id, {
          email,
          role,
        })
        setEmail("")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <div className="grid gap-6">
      {canManage ? (
        <Dialog>
          <DialogTrigger render={<Button className="w-fit" />}>
            <MailPlusIcon data-icon="inline-start" />
            Invite member
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                Invite a user as Admin or Member. Super Admin transfer happens
                from the member table.
              </DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={invite}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                  <Input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <Select
                    value={role}
                    onValueChange={(value) => {
                      if (isInvitationRole(value)) {
                        setRole(value)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button disabled={pending} type="submit">
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {member.name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{member.name}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      <Select
                        value={member.role}
                        disabled={pending}
                        onValueChange={(value) => {
                          if (isOrganizationRole(value)) {
                            updateRole(member.id, value)
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            {organization.permissions.canTransferSuperAdmin ? (
                              <SelectItem value="super_admin">
                                Super Admin
                              </SelectItem>
                            ) : null}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="secondary">
                        {roleLabel(member.role)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage ? (
                      <RemoveMemberButton
                        disabled={pending || member.role === "super_admin"}
                        onRemove={() => {
                          startTransition(async () => {
                            try {
                              await browserConsoleApi.removeMember(
                                organization.id,
                                member.id
                              )
                              router.refresh()
                            } catch (error) {
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Failed"
                              )
                            }
                          })
                        }}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between rounded-2xl border p-3"
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {roleLabel(invitation.role)}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startTransition(async () => {
                        await browserConsoleApi.cancelInvitation(
                          organization.id,
                          invitation.id
                        )
                        router.refresh()
                      })
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

const RemoveMemberButton = ({
  disabled,
  onRemove,
}: {
  disabled: boolean
  onRemove: () => void
}) => (
  <AlertDialog>
    <AlertDialogTrigger
      render={<Button variant="ghost" size="icon-sm" disabled={disabled} />}
    >
      <Trash2Icon />
      <span className="sr-only">Remove member</span>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove member?</AlertDialogTitle>
        <AlertDialogDescription>
          This immediately removes the user from the organization.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onRemove}>
          Remove
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

export const OrganizationSettingsForm = ({
  organization,
}: {
  organization: OrganizationDetail
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(organization.name)
  const [slug, setSlug] = useState(organization.slug)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      await browserConsoleApi.updateOrganization(organization.id, {
        name,
        slug,
      })
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="pt-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-name">Name</FieldLabel>
              <Input
                id="org-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">Slug</FieldLabel>
              <Input
                id="org-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
              />
            </Field>
            <Button disabled={pending} type="submit">
              Save organization
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  )
}

export const EmptyOrganizationState = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Building2Icon />
      </EmptyMedia>
      <EmptyTitle>No organization yet</EmptyTitle>
      <EmptyDescription>
        Create an organization to start using the SaaS console.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
)

export const InvitationDecisionPanel = ({
  invitationId,
}: {
  invitationId: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const decide = (action: "accept" | "reject") => {
    startTransition(async () => {
      const response = await fetch(
        `${clientEnv.NEXT_PUBLIC_API_BASE_URL}/auth/organization/${action}-invitation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ invitationId }),
        }
      )

      if (!response.ok) {
        toast.error("Invitation could not be updated")
        return
      }

      router.replace("/dashboard")
      router.refresh()
    })
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Organization invitation</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button disabled={pending} onClick={() => decide("accept")}>
          Accept invitation
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => decide("reject")}
        >
          Reject
        </Button>
      </CardContent>
    </Card>
  )
}
