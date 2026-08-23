"use client"

import {
  useAuth,
  useDeletePasskey,
  useLinkSocial,
  useListAccounts,
  useListPasskeys,
  useUnlinkAccount,
} from "@better-auth-ui/react"
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
import { Badge } from "@enterprise-agentic-saas/ui/components/badge"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@enterprise-agentic-saas/ui/components/empty"
import { Skeleton } from "@enterprise-agentic-saas/ui/components/skeleton"
import {
  KeyRoundIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
  Unlink2Icon,
} from "lucide-react"
import { useCallback, useMemo } from "react"
import { toast } from "sonner"

import { LocalDate } from "@/components/local-date/local-date"
import {
  createAuthCallbackURL,
  requirePasskeyAuthClient,
  safeAuthErrorMessage,
} from "@/features/auth"

import { useAccountController } from "../../hooks/use-account-controller"
import {
  parseLinkedAccounts,
  parseUserPasskeys,
  type LinkedAccount,
  type UserPasskey,
} from "../../schema"

const securityMutationFallback =
  "The security method could not be updated. Try again."

const GitHubMarkIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className="size-4"
  >
    <path d="M12 .5a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.38-1.33-1.75-1.33-1.75-1.08-.75.08-.74.08-.74 1.2.08 1.83 1.22 1.83 1.22 1.06 1.8 2.8 1.28 3.49.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.32-5.47-5.88 0-1.3.47-2.37 1.23-3.2-.12-.3-.53-1.52.12-3.17 0 0 1.01-.32 3.3 1.22a11.6 11.6 0 0 1 6 0c2.3-1.54 3.3-1.22 3.3-1.22.66 1.65.25 2.87.13 3.17.77.83 1.23 1.9 1.23 3.2 0 4.58-2.8 5.57-5.48 5.87.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
  </svg>
)

const unlinkGithubTrigger = <Button variant="destructive" />
const deletePasskeyTrigger = (
  <Button className="self-start sm:self-auto" variant="destructive" size="sm" />
)

export const SecurityMethodsPanel = () => {
  const { authClient: authClientValue } = useAuth()
  const authClient = useMemo(
    () => requirePasskeyAuthClient(authClientValue),
    [authClientValue]
  )
  const accountsQuery = useListAccounts(authClient, {
    retry: false,
  })
  const passkeysQuery = useListPasskeys(authClient, {
    retry: false,
  })
  const securityMethods = useMemo(() => {
    if (accountsQuery.data === undefined || passkeysQuery.data === undefined) {
      return undefined
    }
    try {
      return {
        accounts: parseLinkedAccounts(accountsQuery.data),
        passkeys: parseUserPasskeys(passkeysQuery.data),
      }
    } catch {
      return null
    }
  }, [accountsQuery.data, passkeysQuery.data])
  const linkGithubMutation = useLinkSocial(authClient, {
    onError: (error) => {
      toast.error(safeAuthErrorMessage(error, securityMutationFallback))
    },
  })
  const unlinkGithubMutation = useUnlinkAccount(authClient, {
    onSuccess: () => {
      toast.success("GitHub account unlinked")
    },
    onError: (error) => {
      toast.error(safeAuthErrorMessage(error, securityMutationFallback))
    },
  })
  const deletePasskeyMutation = useDeletePasskey(authClient, {
    onSuccess: () => {
      toast.success("Passkey deleted")
    },
    onError: (error) => {
      toast.error(safeAuthErrorMessage(error, securityMutationFallback))
    },
  })
  const githubAccount = securityMethods?.accounts.find(
    (account) => account.providerId === "github"
  )
  const linkGithub = useCallback(() => {
    linkGithubMutation.mutate({
      provider: "github",
      callbackURL: createAuthCallbackURL("/settings/account"),
    })
  }, [linkGithubMutation])
  const unlinkGithub = useCallback(() => {
    if (githubAccount) {
      unlinkGithubMutation.mutate({ accountId: githubAccount.accountId })
    }
  }, [githubAccount, unlinkGithubMutation])
  const passkeyRegistration = useAccountController(authClient)
  const deletePasskey = useCallback(
    (passkeyId: string) => deletePasskeyMutation.mutate({ id: passkeyId }),
    [deletePasskeyMutation]
  )
  const retry = useCallback(() => {
    void Promise.all([accountsQuery.refetch(), passkeysQuery.refetch()])
  }, [accountsQuery, passkeysQuery])
  const securityMutationPending =
    linkGithubMutation.isPending ||
    unlinkGithubMutation.isPending ||
    deletePasskeyMutation.isPending ||
    passkeyRegistration.mutation.isPending
  const securityMethodsError =
    accountsQuery.isError || passkeysQuery.isError || securityMethods === null
  const securityMethodsPending =
    !securityMethodsError &&
    (accountsQuery.isPending || passkeysQuery.isPending)

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border p-4 sm:p-5"
      aria-labelledby="security-methods-heading"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheckIcon aria-hidden="true" />
        </span>
        <div>
          <h2 id="security-methods-heading" className="font-medium">
            Security methods
          </h2>
          <p className="text-sm text-muted-foreground">
            Keep at least one working sign-in method connected to your account.
          </p>
        </div>
      </div>

      {securityMethodsPending ? <SecurityMethodsSkeleton /> : null}
      {securityMethodsError ? (
        <Empty className="border" role="alert">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlertIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Security methods could not be loaded</EmptyTitle>
            <EmptyDescription>
              Your account was not changed. Try the request again.
            </EmptyDescription>
            <Button variant="outline" onClick={retry}>
              <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              Try again
            </Button>
          </EmptyHeader>
        </Empty>
      ) : null}
      {securityMethods ? (
        <div className="grid gap-6">
          <GithubMethod
            account={githubAccount}
            pending={securityMutationPending}
            unlinkPending={unlinkGithubMutation.isPending}
            onLink={linkGithub}
            onUnlink={unlinkGithub}
          />
          <div className="grid gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium">Passkeys</h3>
                <p className="text-sm text-muted-foreground">
                  Use platform biometrics, a device PIN, or a security key.
                </p>
              </div>
              <Button
                ref={passkeyRegistration.triggerRef}
                variant="outline"
                disabled={securityMutationPending}
                onClick={passkeyRegistration.register}
              >
                <KeyRoundIcon data-icon="inline-start" aria-hidden="true" />
                Add passkey
              </Button>
            </div>
            {securityMethods.passkeys.length > 0 ? (
              <div className="divide-y rounded-xl border">
                {securityMethods.passkeys.map((passkey) => (
                  <PasskeyRow
                    key={passkey.id}
                    passkey={passkey}
                    pending={securityMutationPending}
                    onDelete={deletePasskey}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No passkeys are registered yet.
              </p>
            )}
          </div>
        </div>
      ) : null}
      <PasskeyStepUpDialog
        open={passkeyRegistration.reauthenticationOpen}
        onOpenChange={passkeyRegistration.handleReauthenticationOpenChange}
        onContinue={passkeyRegistration.continueReauthentication}
      />
    </section>
  )
}

const GithubMethod = ({
  account,
  pending,
  unlinkPending,
  onLink,
  onUnlink,
}: {
  account?: LinkedAccount
  pending: boolean
  unlinkPending: boolean
  onLink: () => void
  onUnlink: () => void
}) => (
  <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <GitHubMarkIcon />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">GitHub</h3>
          <Badge variant={account ? "secondary" : "outline"}>
            {account ? "Linked" : "Not linked"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {account ? (
            <>
              Linked{" "}
              {account.createdAt ? (
                <LocalDate
                  value={
                    account.createdAt instanceof Date
                      ? account.createdAt.toISOString()
                      : account.createdAt
                  }
                  includeTime
                />
              ) : (
                "Unknown"
              )}
            </>
          ) : (
            "Connect GitHub for OAuth sign-in and account recovery."
          )}
        </p>
      </div>
    </div>
    {account ? (
      <AlertDialog>
        <AlertDialogTrigger render={unlinkGithubTrigger} disabled={pending}>
          <Unlink2Icon data-icon="inline-start" aria-hidden="true" />
          Unlink
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink GitHub?</AlertDialogTitle>
            <AlertDialogDescription>
              Continue only if another working sign-in method remains connected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={unlinkPending}
              onClick={onUnlink}
            >
              Unlink GitHub
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ) : (
      <Button variant="outline" disabled={pending} onClick={onLink}>
        <span data-icon="inline-start">
          <GitHubMarkIcon />
        </span>
        Link GitHub
      </Button>
    )}
  </div>
)

const PasskeyRow = ({
  passkey,
  pending,
  onDelete,
}: {
  passkey: UserPasskey
  pending: boolean
  onDelete: (passkeyId: string) => void
}) => {
  const requestDelete = useCallback(() => {
    onDelete(passkey.id)
  }, [onDelete, passkey.id])
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <KeyRoundIcon aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{passkey.name ?? "Unnamed passkey"}</p>
          {passkey.backedUp ? (
            <Badge variant="secondary">Backed up</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {passkey.deviceType ?? "Unknown device"} · Created{" "}
          {passkey.createdAt ? (
            <LocalDate
              value={
                passkey.createdAt instanceof Date
                  ? passkey.createdAt.toISOString()
                  : passkey.createdAt
              }
              includeTime
            />
          ) : (
            "Unknown"
          )}
        </p>
      </div>
      <AlertDialog>
        <AlertDialogTrigger render={deletePasskeyTrigger} disabled={pending}>
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this passkey?</AlertDialogTitle>
            <AlertDialogDescription>
              This passkey will stop working immediately. Keep another sign-in
              method available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={requestDelete}
            >
              Delete passkey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const PasskeyStepUpDialog = ({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onContinue: () => void
}) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Sign in again to add a passkey</AlertDialogTitle>
        <AlertDialogDescription>
          Your session is no longer recent enough for this security-sensitive
          change. Sign in again, then passkey setup will resume here.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onContinue}>
          Continue to sign in
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)

const SecurityMethodsSkeleton = () => (
  <div
    className="grid gap-3"
    role="status"
    aria-label="Loading security methods"
  >
    <Skeleton className="h-24 w-full rounded-xl" />
    <Skeleton className="h-24 w-full rounded-xl" />
  </div>
)
