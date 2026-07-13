"use client"

/* oxlint-disable eslint-plugin-react-perf(jsx-no-new-function-as-prop) */

import { useAuth } from "@better-auth-ui/react"
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
  AvatarImage,
} from "@enterprise-agentic-saas/ui/components/avatar"
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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
} from "@enterprise-agentic-saas/ui/components/select"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@enterprise-agentic-saas/ui/components/table"
import {
  Building2Icon,
  KeyRoundIcon,
  LaptopIcon,
  Unlink2Icon,
  MailPlusIcon,
  PlusIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react"
import { toast } from "sonner"

import { createAuthCallbackURL } from "@/lib/auth/callback-url"
import { getSafeAvatarUrl } from "@/lib/avatar-url"
import { browserConsoleApi } from "@/lib/browser/console-api"
import {
  isStepUpRequiredError,
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

const invitationRoleOptions = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
]

const organizationRoleOptions = [
  ...invitationRoleOptions,
  { label: "Super Admin", value: "super_admin" },
]

const toOrganizationSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

type AuthResult<T> = {
  data?: T | null
  error?: { message?: string } | null
}

type LinkedAccount = {
  id?: string
  accountId?: string
  providerId: string
  createdAt?: string | Date | null
}

type UserPasskey = {
  id: string
  name?: string | null
  createdAt?: string | Date | null
  deviceType?: string | null
  backedUp?: boolean | null
}

type SecurityAuthCapabilities = {
  listAccounts?: () => Promise<AuthResult<LinkedAccount[]> | LinkedAccount[]>
  linkSocial?: (input: {
    provider: "github"
    callbackURL: string
  }) => Promise<AuthResult<unknown>>
  unlinkAccount?: (input: {
    providerId: string
    accountId?: string
  }) => Promise<AuthResult<unknown>>
  passkey?: {
    listUserPasskeys?: () => Promise<AuthResult<UserPasskey[]> | UserPasskey[]>
    addPasskey?: (input: {
      name?: string
      authenticatorAttachment?: "platform" | "cross-platform"
    }) => Promise<AuthResult<unknown>>
    deletePasskey?: (input: { id: string }) => Promise<AuthResult<unknown>>
  }
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const isPropertyContainer = (
  value: unknown
): value is Record<string, unknown> | ((...args: unknown[]) => unknown) =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const getProperty = (target: unknown, key: string): unknown => {
  if (!isPropertyContainer(target)) {
    return undefined
  }
  return Reflect.get(target, key)
}

const hasAuthError = (
  value: unknown
): value is { error: { message?: string } | null } =>
  isObjectRecord(value) && "error" in value

const hasAuthData = <T,>(value: unknown): value is { data?: T | null } =>
  isObjectRecord(value) && "data" in value

const createSecurityAuthCapabilities = (
  value: unknown
): SecurityAuthCapabilities => {
  if (!isPropertyContainer(value)) {
    return {}
  }

  const capabilities: SecurityAuthCapabilities = {}
  const listAccountsCandidate = getProperty(value, "listAccounts")
  if (typeof listAccountsCandidate === "function") {
    capabilities.listAccounts = () =>
      Reflect.apply(listAccountsCandidate, value, [])
  }
  const linkSocialCandidate = getProperty(value, "linkSocial")
  if (typeof linkSocialCandidate === "function") {
    capabilities.linkSocial = (input) =>
      Reflect.apply(linkSocialCandidate, value, [input])
  }
  const unlinkAccountCandidate = getProperty(value, "unlinkAccount")
  if (typeof unlinkAccountCandidate === "function") {
    capabilities.unlinkAccount = (input) =>
      Reflect.apply(unlinkAccountCandidate, value, [input])
  }

  const passkey = getProperty(value, "passkey")
  if (isPropertyContainer(passkey)) {
    const passkeyCapabilities: NonNullable<
      SecurityAuthCapabilities["passkey"]
    > = {}
    const listUserPasskeysCandidate = getProperty(passkey, "listUserPasskeys")
    if (typeof listUserPasskeysCandidate === "function") {
      passkeyCapabilities.listUserPasskeys = () =>
        Reflect.apply(listUserPasskeysCandidate, passkey, [])
    }
    const addPasskeyCandidate = getProperty(passkey, "addPasskey")
    if (typeof addPasskeyCandidate === "function") {
      passkeyCapabilities.addPasskey = (input) =>
        Reflect.apply(addPasskeyCandidate, passkey, [input])
    }
    const deletePasskeyCandidate = getProperty(passkey, "deletePasskey")
    if (typeof deletePasskeyCandidate === "function") {
      passkeyCapabilities.deletePasskey = (input) =>
        Reflect.apply(deletePasskeyCandidate, passkey, [input])
    }
    capabilities.passkey = passkeyCapabilities
  }

  return capabilities
}

const unwrapAuthResult = <T,>(result: AuthResult<T> | T): T | undefined => {
  if (hasAuthError(result) && result.error) {
    throw new Error(result.error.message ?? "Authentication request failed")
  }

  if (hasAuthData<T>(result)) {
    return result.data ?? undefined
  }

  return result
}

const formatSecurityDate = (value?: string | Date | null) => {
  if (!value) {
    return "Unknown"
  }

  return new Date(value).toLocaleString()
}

const describeUserAgent = (userAgent: string | null) => {
  if (!userAgent) {
    return {
      friendly: "Unknown device",
      raw: "No user agent was recorded.",
    }
  }

  const browser = detectBrowser(userAgent)
  const device = detectDevice(userAgent)

  return {
    friendly: `${device} (${browser})`,
    raw: userAgent,
  }
}

const detectDevice = (userAgent: string) => {
  if (/iPhone/i.test(userAgent)) return "Apple iPhone"
  if (/iPad/i.test(userAgent)) return "Apple iPad"
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Apple MacBook"
  if (/Windows NT/i.test(userAgent)) return "Windows PC"
  if (/Android/i.test(userAgent)) return "Android device"
  if (/Linux/i.test(userAgent)) return "Linux device"

  return "Unknown device"
}

const detectBrowser = (userAgent: string) => {
  const edge = userAgent.match(/Edg\/([\d.]+)/i)
  if (edge?.[1]) return `Edge ${majorVersion(edge[1])}`

  const chrome = userAgent.match(/Chrome\/([\d.]+)/i)
  if (chrome?.[1]) return `Chrome ${majorVersion(chrome[1])}`

  const firefox = userAgent.match(/Firefox\/([\d.]+)/i)
  if (firefox?.[1]) return `Firefox ${majorVersion(firefox[1])}`

  const safari = userAgent.match(/Version\/([\d.]+).*Safari/i)
  if (safari?.[1]) return `Safari ${majorVersion(safari[1])}`

  return "Unknown browser"
}

const majorVersion = (version: string) => version.split(".")[0]

const GitHubMarkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 .5a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.33-1.75-1.33-1.75-1.08-.75.08-.74.08-.74 1.2.08 1.83 1.22 1.83 1.22 1.06 1.8 2.8 1.28 3.49.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.32-5.47-5.88 0-1.3.47-2.37 1.23-3.2-.12-.3-.53-1.52.12-3.17 0 0 1.01-.32 3.3 1.22a11.6 11.6 0 0 1 6 0c2.3-1.54 3.3-1.22 3.3-1.22.66 1.65.25 2.87.13 3.17.77.83 1.23 1.9 1.23 3.2 0 4.58-2.8 5.57-5.48 5.87.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
  </svg>
)

const OrganizationCreateForm = ({ redirectTo }: { redirectTo?: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugEdited, setSlugEdited] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        await browserConsoleApi.createOrganization({ name, slug })
        setName("")
        setSlug("")
        setSlugEdited(false)
        toast.success("Organization created")
        if (redirectTo) {
          router.replace(redirectTo)
        }
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed")
      }
    })
  }

  return (
    <form className="w-full" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Create organization</CardTitle>
          <CardDescription>
            Create a tenant-isolated workspace for members and issues.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="organization-name">Name</FieldLabel>
              <Input
                id="organization-name"
                value={name}
                onChange={(event) => {
                  const nextName = event.target.value
                  setName(nextName)
                  if (!slugEdited) {
                    setSlug(toOrganizationSlug(nextName))
                  }
                }}
                placeholder="Acme Operations"
                autoComplete="organization"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="organization-slug">Slug</FieldLabel>
              <Input
                id="organization-slug"
                value={slug}
                onChange={(event) => {
                  setSlugEdited(true)
                  setSlug(toOrganizationSlug(event.target.value))
                }}
                placeholder="acme-operations"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                minLength={2}
                maxLength={48}
                spellCheck={false}
                required
              />
              <FieldDescription>
                Lowercase letters, numbers, and hyphens.
              </FieldDescription>
            </Field>
            <Button disabled={pending} type="submit">
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
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
        <CardContent>
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

export const SecurityMethodsPanel = () => {
  const { authClient } = useAuth()
  const router = useRouter()
  const securityAuthClient = useMemo(
    () => createSecurityAuthCapabilities(authClient),
    [authClient]
  )
  const canListAccounts = Boolean(securityAuthClient.listAccounts)
  const canLinkGithub = Boolean(securityAuthClient.linkSocial)
  const canUnlinkGithub = Boolean(securityAuthClient.unlinkAccount)
  const canListPasskeys = Boolean(securityAuthClient.passkey?.listUserPasskeys)
  const canAddPasskey = Boolean(securityAuthClient.passkey?.addPasskey)
  const canDeletePasskey = Boolean(securityAuthClient.passkey?.deletePasskey)
  const securityMethodsAvailable =
    canListAccounts ||
    canLinkGithub ||
    canUnlinkGithub ||
    canListPasskeys ||
    canAddPasskey ||
    canDeletePasskey
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<LinkedAccount[]>([])
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([])

  const loadSecurityMethods = useCallback(async () => {
    if (!securityMethodsAvailable) {
      setLoading(false)
      setAccounts([])
      setPasskeys([])
      return
    }

    setLoading(true)
    try {
      const [nextAccounts, nextPasskeys] = await Promise.all([
        canListAccounts && securityAuthClient.listAccounts
          ? securityAuthClient.listAccounts()
          : Promise.resolve([]),
        canListPasskeys && securityAuthClient.passkey?.listUserPasskeys
          ? securityAuthClient.passkey.listUserPasskeys()
          : Promise.resolve([]),
      ])
      setAccounts(unwrapAuthResult(nextAccounts) ?? [])
      setPasskeys(unwrapAuthResult(nextPasskeys) ?? [])
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load security methods"
      )
    } finally {
      setLoading(false)
    }
  }, [
    canListAccounts,
    canListPasskeys,
    securityAuthClient,
    securityMethodsAvailable,
  ])

  useEffect(() => {
    void loadSecurityMethods()
  }, [loadSecurityMethods])

  const githubAccount = accounts.find(
    (account) => account.providerId === "github"
  )

  const runSecurityAction = async (
    actionId: string,
    action: () => Promise<void>
  ) => {
    if (!securityMethodsAvailable) {
      return
    }

    setPendingAction(actionId)
    try {
      await action()
      await loadSecurityMethods()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Request failed")
    } finally {
      setPendingAction(null)
    }
  }

  const linkGithub = () =>
    runSecurityAction("github-link", async () => {
      if (!securityAuthClient.linkSocial) {
        return
      }
      unwrapAuthResult(
        await securityAuthClient.linkSocial({
          provider: "github",
          callbackURL: createAuthCallbackURL("/settings/account"),
        })
      )
    })

  const unlinkGithub = () =>
    runSecurityAction("github-unlink", async () => {
      if (!securityAuthClient.unlinkAccount) {
        return
      }
      if (!githubAccount) {
        throw new Error("GitHub account is not linked")
      }

      unwrapAuthResult(
        await securityAuthClient.unlinkAccount({
          providerId: "github",
          accountId: githubAccount.accountId,
        })
      )
      toast.success("GitHub account unlinked")
    })

  const addPasskey = () =>
    runSecurityAction("passkey-add", async () => {
      if (!securityAuthClient.passkey?.addPasskey) {
        return
      }
      unwrapAuthResult(
        await securityAuthClient.passkey.addPasskey({
          name: "Enterprise Agentic SaaS",
          authenticatorAttachment: "platform",
        })
      )
      toast.success("Passkey added")
    })

  const deletePasskey = (passkeyId: string) =>
    runSecurityAction(`passkey-delete-${passkeyId}`, async () => {
      if (!securityAuthClient.passkey?.deletePasskey) {
        return
      }
      unwrapAuthResult(
        await securityAuthClient.passkey.deletePasskey({ id: passkeyId })
      )
      toast.success("Passkey deleted")
    })

  return (
    <Card className="border-foreground/10 bg-card/85">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-4xl bg-primary/10 text-primary">
          <ShieldCheckIcon aria-hidden="true" />
        </div>
        <CardTitle>Security methods</CardTitle>
        <CardDescription>
          Manage linked sign-in methods. At least one sign-in method must remain
          connected.
        </CardDescription>
        {!securityMethodsAvailable ? (
          <p className="text-sm text-muted-foreground">
            Security methods are currently unavailable in this session.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3">
          <div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-4xl bg-muted text-muted-foreground">
                <GitHubMarkIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">GitHub</p>
                  {githubAccount ? (
                    <Badge variant="secondary">Linked</Badge>
                  ) : (
                    <Badge variant="outline">Not linked</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {githubAccount
                    ? `Linked ${formatSecurityDate(githubAccount.createdAt)}`
                    : "Connect GitHub for OAuth sign-in and account recovery."}
                </p>
              </div>
            </div>
            {githubAccount ? (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="destructive"
                      disabled={!canUnlinkGithub || loading}
                    />
                  }
                >
                  <span data-icon="inline-start">
                    <Unlink2Icon className="size-4" />
                  </span>
                  Unlink
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Unlink GitHub?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You can unlink GitHub only when another sign-in method
                      remains connected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      disabled={pendingAction === "github-unlink"}
                      onClick={unlinkGithub}
                    >
                      Unlink GitHub
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                variant="outline"
                disabled={
                  !canLinkGithub || loading || pendingAction === "github-link"
                }
                onClick={linkGithub}
              >
                <span data-icon="inline-start">
                  <GitHubMarkIcon className="size-4" />
                </span>
                Link GitHub
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Passkeys</p>
              <p className="text-sm text-muted-foreground">
                Use platform biometrics, device PINs, or security keys.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={
                !canAddPasskey || loading || pendingAction === "passkey-add"
              }
              onClick={addPasskey}
            >
              <KeyRoundIcon data-icon="inline-start" />
              Add passkey
            </Button>
          </div>

          {passkeys.length > 0 ? (
            <div className="grid gap-3">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-4xl bg-muted text-muted-foreground">
                      <KeyRoundIcon aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {passkey.name ?? "Unnamed passkey"}
                        </p>
                        {passkey.backedUp ? (
                          <Badge variant="secondary">Backed up</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {passkey.deviceType ?? "Unknown device"} · Created{" "}
                        {formatSecurityDate(passkey.createdAt)}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={<Button variant="destructive" />}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete passkey?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This passkey will no longer be available for sign-in.
                          Keep at least one working sign-in method connected.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          disabled={
                            !canDeletePasskey ||
                            pendingAction === `passkey-delete-${passkey.id}`
                          }
                          onClick={() => deletePasskey(passkey.id)}
                        >
                          Delete passkey
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
              {loading
                ? "Loading passkeys..."
                : "No passkeys are registered yet."}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
    <Card className="border-foreground/10 bg-card/85">
      <CardHeader>
        <div className="flex size-10 items-center justify-center rounded-4xl bg-primary/10 text-primary">
          <LaptopIcon aria-hidden="true" />
        </div>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>
          Review friendly device labels and raw browser user agents.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex justify-end">
          <Button
            variant="destructive"
            onClick={revokeOthers}
            disabled={pending}
          >
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
            {sessions.map((session) => {
              const userAgent = describeUserAgent(session.userAgent)

              return (
                <TableRow key={session.id}>
                  <TableCell className="max-w-136 whitespace-normal">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-4xl bg-muted text-muted-foreground">
                        <LaptopIcon aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{userAgent.friendly}</p>
                          {session.current ? (
                            <Badge variant="secondary">Current</Badge>
                          ) : null}
                        </div>
                        <p className="mt-2 rounded-3xl bg-muted/70 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
                          {userAgent.raw}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Expires {new Date(session.expiresAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(session.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending || session.current}
                      onClick={() => revoke(session.id)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Your organizations</CardTitle>
          <CardDescription>
            Switch the active organization for this session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length > 0 ? (
            <div className="grid gap-3">
              {organizations.map((organization) => (
                <div
                  key={organization.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{organization.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {organization.slug}
                      </p>
                      <Badge variant="secondary">
                        {roleLabel(organization.role)}
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="flex -space-x-2">
                        {organization.memberAvatars
                          .slice(0, 10)
                          .map((memberAvatar) => (
                            <Avatar
                              key={`${organization.id}-${memberAvatar.userId}`}
                              className="size-6 border-2 border-background"
                            >
                              <AvatarImage
                                src={getSafeAvatarUrl(memberAvatar.image)}
                                alt={memberAvatar.name}
                              />
                              <AvatarFallback className="text-[10px]">
                                {memberAvatar.name.slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        {organization.memberAvatars.length > 10 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ...
                          </span>
                        ) : null}
                      </div>
                      <span>{organization.memberCount} members</span>
                    </div>
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
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2Icon />
                </EmptyMedia>
                <EmptyTitle>No organizations yet</EmptyTitle>
                <EmptyDescription>
                  Create an organization to unlock the console workspace.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
      <OrganizationCreateForm
        redirectTo={organizations.length === 0 ? "/dashboard" : undefined}
      />
    </div>
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
  const [pendingSuperAdminTransfer, setPendingSuperAdminTransfer] =
    useState<OrganizationMember | null>(null)
  const [superAdminConfirmation, setSuperAdminConfirmation] = useState("")
  const [stepUpRequest, setStepUpRequest] = useState<{
    action?: string
    maxAgeSeconds?: number
  } | null>(null)
  const canManage = organization.permissions.canManageMembers
  const canManageRoles = organization.permissions.canManageAdmins
  const superAdminCount = members.filter(
    (member) => member.role === "super_admin"
  ).length

  const getRoleDisabledReason = () => {
    if (canManageRoles) {
      return null
    }

    return "Only Super Admins can change organization roles."
  }

  const isOnlySuperAdmin = (member: OrganizationMember) =>
    member.role === "super_admin" && superAdminCount <= 1

  const canSelectRole = (
    member: OrganizationMember,
    nextRole: OrganizationRole
  ) => {
    if (!canManageRoles) {
      return nextRole === member.role
    }

    if (isOnlySuperAdmin(member) && nextRole !== "super_admin") {
      return false
    }

    return true
  }

  const handleMutationError = (error: unknown) => {
    if (isStepUpRequiredError(error)) {
      setStepUpRequest({
        action:
          typeof error.context.action === "string"
            ? error.context.action
            : undefined,
        maxAgeSeconds:
          typeof error.context.maxAgeSeconds === "number"
            ? error.context.maxAgeSeconds
            : undefined,
      })
      return
    }

    toast.error(error instanceof Error ? error.message : "Failed")
  }

  const updateRole = (
    memberId: string,
    nextRole: Exclude<OrganizationRole, "super_admin">
  ) => {
    startTransition(async () => {
      try {
        await browserConsoleApi.updateMemberRole(
          organization.id,
          memberId,
          nextRole
        )
        router.refresh()
      } catch (error) {
        handleMutationError(error)
      }
    })
  }

  const transferSuperAdmin = (
    member: OrganizationMember,
    confirmation: string
  ) => {
    startTransition(async () => {
      try {
        await browserConsoleApi.transferSuperAdmin(organization.id, {
          memberId: member.id,
          confirmation,
        })
        setPendingSuperAdminTransfer(null)
        setSuperAdminConfirmation("")
        router.refresh()
      } catch (error) {
        handleMutationError(error)
      }
    })
  }

  const changeRole = (
    member: OrganizationMember,
    nextRole: OrganizationRole
  ) => {
    if (nextRole === member.role) {
      return
    }

    if (nextRole === "super_admin") {
      setPendingSuperAdminTransfer(member)
      return
    }

    updateRole(member.id, nextRole)
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
        handleMutationError(error)
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
                    items={invitationRoleOptions}
                    value={role}
                    onValueChange={(value) => {
                      if (isInvitationRole(value)) {
                        setRole(value)
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <span className="min-w-0 flex-1 truncate text-left">
                        {roleLabel(role)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin" disabled={!canManageRoles}>
                          Admin
                        </SelectItem>
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
        <CardContent>
          <AlertDialog
            open={stepUpRequest !== null}
            onOpenChange={(open) => {
              if (!open) {
                setStepUpRequest(null)
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm it is really you</AlertDialogTitle>
                <AlertDialogDescription>
                  This security-sensitive change needs a recent sign-in
                  {stepUpRequest?.maxAgeSeconds
                    ? ` from the last ${Math.floor(stepUpRequest.maxAgeSeconds / 60)} minutes`
                    : ""}
                  . Sign in again, then retry the change.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Not now</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const redirectTo = `${window.location.pathname}${window.location.search}`
                    const action =
                      stepUpRequest?.action ?? "organization.manage"
                    window.location.assign(
                      `/auth/sign-in?reauth=1&action=${encodeURIComponent(action)}&redirectTo=${encodeURIComponent(redirectTo)}`
                    )
                  }}
                >
                  Sign in again
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog
            open={pendingSuperAdminTransfer !== null}
            onOpenChange={(open) => {
              if (!open) {
                setPendingSuperAdminTransfer(null)
                setSuperAdminConfirmation("")
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Transfer Super Admin</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingSuperAdminTransfer
                    ? `${pendingSuperAdminTransfer.name} will become the Super Admin. The current Super Admin will be downgraded to Admin.`
                    : "The selected member will become the Super Admin. The current Super Admin will be downgraded to Admin."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor="super-admin-confirmation">
                  Confirm the new Super Admin email
                </FieldLabel>
                <Input
                  id="super-admin-confirmation"
                  type="email"
                  value={superAdminConfirmation}
                  onChange={(event) =>
                    setSuperAdminConfirmation(event.target.value)
                  }
                  placeholder={pendingSuperAdminTransfer?.email}
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>
                  Type {pendingSuperAdminTransfer?.email ?? "the target email"}{" "}
                  to acknowledge that ownership and destructive authority will
                  move to this account.
                </FieldDescription>
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={
                    pending ||
                    superAdminConfirmation !== pendingSuperAdminTransfer?.email
                  }
                  onClick={() => {
                    const target = pendingSuperAdminTransfer
                    if (!target) {
                      return
                    }
                    transferSuperAdmin(target, superAdminConfirmation)
                  }}
                >
                  Transfer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const disabledReason = getRoleDisabledReason()
                const onlySuperAdmin = isOnlySuperAdmin(member)

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage
                            src={getSafeAvatarUrl(member.image)}
                            alt={member.name}
                          />
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
                      <Select
                        items={organizationRoleOptions}
                        value={member.role}
                        disabled={pending || disabledReason !== null}
                        onValueChange={(value) => {
                          if (isOrganizationRole(value)) {
                            changeRole(member, value)
                          }
                        }}
                      >
                        <SelectTrigger className="w-40">
                          <span className="min-w-0 flex-1 truncate text-left">
                            {roleLabel(member.role)}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem
                              value="member"
                              disabled={!canSelectRole(member, "member")}
                            >
                              Member
                            </SelectItem>
                            <SelectItem
                              value="admin"
                              disabled={!canSelectRole(member, "admin")}
                            >
                              Admin
                            </SelectItem>
                            <SelectItem
                              value="super_admin"
                              disabled={!canSelectRole(member, "super_admin")}
                            >
                              Super Admin
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {disabledReason ? (
                        <p className="mt-2 max-w-56 text-xs text-muted-foreground">
                          {disabledReason}
                        </p>
                      ) : null}
                      {canManageRoles && onlySuperAdmin ? (
                        <p className="mt-2 max-w-56 text-xs text-muted-foreground">
                          Transfer Super Admin before demoting this member.
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <RemoveMemberButton
                          member={member}
                          disabled={
                            pending ||
                            member.role === "super_admin" ||
                            (organization.role === "admin" &&
                              member.role !== "member")
                          }
                          onRemove={(confirmation) => {
                            startTransition(async () => {
                              try {
                                await browserConsoleApi.removeMember(
                                  organization.id,
                                  member.id,
                                  confirmation
                                )
                                router.refresh()
                              } catch (error) {
                                handleMutationError(error)
                              }
                            })
                          }}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invitations</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between rounded-2xl border p-3"
              >
                <div>
                  <p className="font-medium">{invitation.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      {roleLabel(invitation.role)}
                    </p>
                    <Badge variant="outline" className="capitalize">
                      {invitation.status}
                    </Badge>
                  </div>
                </div>
                {canManage && invitation.status === "pending" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await browserConsoleApi.cancelInvitation(
                            organization.id,
                            invitation.id
                          )
                          router.refresh()
                        } catch (error) {
                          handleMutationError(error)
                        }
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
  member,
  disabled,
  onRemove,
}: {
  member: OrganizationMember
  disabled: boolean
  onRemove: (confirmation: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setConfirmation("")
        }
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" disabled={disabled} />}
      >
        <Trash2Icon />
        <span className="sr-only">Remove {member.name}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This immediately removes the user from the organization. Type their
            email to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor={`remove-member-${member.id}`}>
            Member email
          </FieldLabel>
          <Input
            id={`remove-member-${member.id}`}
            type="email"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={member.email}
            autoComplete="off"
            spellCheck={false}
          />
          <FieldDescription>Type {member.email} exactly.</FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={confirmation !== member.email}
            onClick={() => {
              onRemove(confirmation)
              setOpen(false)
            }}
          >
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

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
        <CardContent>
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
