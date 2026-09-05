"use client"

import { authMutationKeys } from "@better-auth-ui/core"
import { magicLinkPlugin as coreMagicLinkPlugin } from "@better-auth-ui/core/plugins"
import {
  useAuth,
  useAuthPlugin,
  useSignInMagicLink,
} from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldSeparator,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useForm } from "@tanstack/react-form"
import { useIsMutating } from "@tanstack/react-query"
import { ArrowRightIcon, MailCheckIcon } from "lucide-react"
import { type FormEvent, useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage, magicLinkFormSchema } from "@/features/auth"
import { useIsHydrated } from "@/hooks/use-is-hydrated"

import { createAuthCallbackURL } from "../../callback-url"
import { requireMagicLinkAuthClient } from "../../runtime-guards"
import { AuthTextField } from "../auth-form-field/auth-form-field"
import { selectCanSubmit } from "../auth-form-field/form-selectors"
import { createScopedAuthViewHref } from "../auth-route-scope/auth-route-href"
import { useAuthRouteState } from "../auth-route-scope/auth-route-scope"
import { PasskeySignInButton } from "../passkey-sign-in-button/passkey-sign-in-button"
import {
  ProviderButtons,
  type SocialLayout,
} from "../provider-buttons/provider-buttons"

export type MagicLinkProps = {
  className?: string
  mode?: "sign-in" | "sign-up"
  socialLayout?: SocialLayout
  socialPosition?: "top" | "bottom"
}

const requestFailedMessage =
  "We could not send the sign-in link. Check your email and try again."

export function MagicLink({
  className,
  mode = "sign-in",
  socialLayout,
  socialPosition = "bottom",
}: MagicLinkProps) {
  const {
    authClient,
    basePaths,
    localization,
    plugins,
    redirectTo: defaultRedirectTo,
    socialProviders,
    viewPaths,
    Link,
  } = useAuth()
  const authRoute = useAuthRouteState()
  const redirectTo = authRoute?.redirectTo ?? defaultRedirectTo
  const { localization: magicLinkLocalization } =
    useAuthPlugin(coreMagicLinkPlugin)
  const isHydrated = useIsHydrated()
  const requestedEmail = useRef("")
  const [sentTo, setSentTo] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()

  const { mutate: signInMagicLink, isPending: signInMagicLinkPending } =
    useSignInMagicLink(requireMagicLinkAuthClient(authClient), {
      onError: (error) => {
        const message = safeAuthErrorMessage(error, requestFailedMessage)
        setSubmitError(message)
      },
      onSuccess: () => {
        setSentTo(requestedEmail.current)
        toast.success(magicLinkLocalization.magicLinkSent)
      },
    })

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: magicLinkFormSchema },
    onSubmit: ({ value }) => {
      setSubmitError(undefined)
      requestedEmail.current = value.email
      signInMagicLink({
        email: value.email,
        callbackURL: createAuthCallbackURL(redirectTo),
      })
    },
  })
  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  })
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  })
  const isPending =
    signInMagicLinkPending || signInMutating + signUpMutating > 0
  const formDisabled = !isHydrated || isPending
  const showSeparator = socialProviders && socialProviders.length > 0
  const creatingAccount = mode === "sign-up"
  const signInHref = createScopedAuthViewHref({
    basePath: basePaths.auth,
    preserveReauthentication: true,
    route: authRoute,
    viewPath: viewPaths.auth.signIn,
  })
  const signUpHref = createScopedAuthViewHref({
    basePath: basePaths.auth,
    route: authRoute,
    viewPath: viewPaths.auth.signUp,
  })

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const clearSubmitError = useCallback(() => setSubmitError(undefined), [])
  const useAnotherEmail = useCallback(() => {
    setSentTo(undefined)
    setSubmitError(undefined)
    form.reset()
  }, [form])

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {creatingAccount ? "Create account" : localization.auth.signIn}
        </CardTitle>
        <CardDescription>
          {creatingAccount
            ? "Enter your email to create an account with a secure magic link."
            : "Enter your email and we will send a secure sign-in link."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          {socialPosition === "top" ? (
            <>
              {socialProviders && socialProviders.length > 0 ? (
                <ProviderButtons socialLayout={socialLayout} />
              ) : null}
              {showSeparator ? (
                <FieldSeparator className="m-0 flex items-center text-xs *:data-[slot=field-separator-content]:bg-card">
                  {localization.auth.or}
                </FieldSeparator>
              ) : null}
            </>
          ) : null}

          {sentTo ? (
            <div
              className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 p-5 text-center"
              role="status"
            >
              <MailCheckIcon
                className="size-8 text-primary"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  We sent a secure link to <strong>{sentTo}</strong>. You can
                  close this tab after opening the link.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={useAnotherEmail}>
                Use another email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <form.Field name="email">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <AuthTextField
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        label={localization.auth.email}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onEdit={clearSubmitError}
                        onValueChange={field.handleChange}
                        placeholder={localization.auth.emailPlaceholder}
                        disabled={formDisabled}
                        invalid={invalid}
                        errors={field.state.meta.errors}
                      />
                    )
                  }}
                </form.Field>

                {submitError ? <FieldError>{submitError}</FieldError> : null}

                <form.Subscribe selector={selectCanSubmit}>
                  {(canSubmit) => (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={formDisabled || !canSubmit}
                    >
                      {signInMagicLinkPending ? <Spinner /> : null}
                      {magicLinkLocalization.sendMagicLink}
                      <ArrowRightIcon
                        data-icon="inline-end"
                        aria-hidden="true"
                      />
                    </Button>
                  )}
                </form.Subscribe>

                {!creatingAccount ? (
                  <div className="flex flex-col gap-3">
                    <PasskeySignInButton />
                    {plugins.flatMap((plugin) =>
                      (plugin.id === coreMagicLinkPlugin.id
                        ? []
                        : (plugin.authButtons ?? [])
                      ).map((AuthButton, index) => (
                        <AuthButton
                          key={`${plugin.id}-${index.toString()}`}
                          view="magicLink"
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </FieldGroup>
            </form>
          )}

          {socialPosition === "bottom" ? (
            <>
              {showSeparator ? (
                <FieldSeparator className="flex items-center text-xs *:data-[slot=field-separator-content]:bg-card">
                  {localization.auth.or}
                </FieldSeparator>
              ) : null}
              {socialProviders && socialProviders.length > 0 ? (
                <ProviderButtons socialLayout={socialLayout} />
              ) : null}
            </>
          ) : null}
        </div>

        <div className="mt-4 flex w-full flex-col items-center gap-3">
          <FieldDescription className="text-center">
            {creatingAccount ? (
              <>
                Already have an account?{" "}
                <Link
                  href={signInHref}
                  prefetch={false}
                  className="underline underline-offset-4"
                >
                  {localization.auth.signIn}
                </Link>
              </>
            ) : (
              <>
                {localization.auth.needToCreateAnAccount}{" "}
                <Link
                  href={signUpHref}
                  prefetch={false}
                  className="underline underline-offset-4"
                >
                  {localization.auth.signUp}
                </Link>
              </>
            )}
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  )
}
