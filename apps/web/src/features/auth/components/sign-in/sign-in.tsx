"use client"

import { authMutationKeys } from "@better-auth-ui/core"
import {
  useAuth,
  useFetchOptions,
  useSendVerificationEmail,
  useSignInEmail,
} from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import { Checkbox } from "@enterprise-agentic-saas/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useForm } from "@tanstack/react-form"
import { useIsMutating } from "@tanstack/react-query"
import { ArrowRightIcon } from "lucide-react"
import { type FormEvent, useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage, createSignInFormSchema } from "@/features/auth"

import { createAuthCallbackURL } from "../../callback-url"
import { findCaptchaComponent } from "../../runtime-guards"
import {
  AuthTextField,
  selectCanSubmit,
} from "../auth-form-field/auth-form-field"
import {
  createScopedAuthViewHref,
  useAuthRouteState,
} from "../auth-route-scope/auth-route-scope"
import { PasskeySignInButton } from "../passkey-sign-in-button/passkey-sign-in-button"
import {
  ProviderButtons,
  type SocialLayout,
} from "../provider-buttons/provider-buttons"

export type SignInProps = {
  className?: string
  socialLayout?: SocialLayout
  socialPosition?: "top" | "bottom"
}

const defaultMinimumPasswordLength = 8
const defaultMaximumPasswordLength = 128
const signInFailedMessage =
  "We could not sign you in. Check your credentials and try again."

const useSignInController = ({
  className,
  socialLayout,
  socialPosition = "bottom",
}: SignInProps) => {
  const {
    authClient,
    basePaths,
    emailAndPassword,
    localization,
    plugins,
    redirectTo: defaultRedirectTo,
    socialProviders,
    viewPaths,
    navigate,
    Link,
  } = useAuth()
  const authRoute = useAuthRouteState()
  const redirectTo = authRoute?.redirectTo ?? defaultRedirectTo
  const { fetchOptions, resetFetchOptions } = useFetchOptions()
  const [submitError, setSubmitError] = useState<string>()
  const minimumPasswordLength =
    emailAndPassword?.minPasswordLength ?? defaultMinimumPasswordLength
  const maximumPasswordLength =
    emailAndPassword?.maxPasswordLength ?? defaultMaximumPasswordLength
  const formSchema = useMemo(
    () => createSignInFormSchema(minimumPasswordLength, maximumPasswordLength),
    [maximumPasswordLength, minimumPasswordLength]
  )

  const { mutate: sendVerificationEmail } = useSendVerificationEmail(
    authClient,
    {
      onSuccess: () => toast.success(localization.auth.verificationEmailSent),
    }
  )
  const { mutate: signInEmail, isPending: signInEmailPending } = useSignInEmail(
    authClient,
    {
      onError: (error, { email }) => {
        const message = safeAuthErrorMessage(error, signInFailedMessage)

        if (error.error?.code === "EMAIL_NOT_VERIFIED") {
          setSubmitError(undefined)
          toast.error(message, {
            action: {
              label: localization.auth.resend,
              onClick: () =>
                sendVerificationEmail({
                  email,
                  callbackURL: createAuthCallbackURL(redirectTo),
                }),
            },
          })
        } else {
          setSubmitError(message)
        }
        resetFetchOptions()
      },
      onSuccess: () => navigate({ to: redirectTo }),
    }
  )
  const form = useForm({
    defaultValues: { email: "", password: "", rememberMe: false },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      setSubmitError(undefined)
      signInEmail({
        email: value.email,
        password: value.password,
        ...(emailAndPassword?.rememberMe
          ? { rememberMe: value.rememberMe }
          : {}),
        fetchOptions,
      })
    },
  })
  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all,
  })
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all,
  })
  const isPending = signInEmailPending || signInMutating + signUpMutating > 0
  const Captcha = findCaptchaComponent(plugins)
  const showSeparator =
    emailAndPassword?.enabled && socialProviders && socialProviders.length > 0
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

  return {
    Captcha,
    Link,
    basePaths,
    className,
    clearSubmitError,
    emailAndPassword,
    form,
    handleSubmit,
    isPending,
    localization,
    plugins,
    showSeparator,
    signInEmailPending,
    signUpHref,
    socialLayout,
    socialPosition,
    socialProviders,
    submitError,
    viewPaths,
  }
}

const SignInCard = ({
  Captcha,
  Link,
  basePaths,
  className,
  clearSubmitError,
  emailAndPassword,
  form,
  handleSubmit,
  isPending,
  localization,
  plugins,
  showSeparator,
  signInEmailPending,
  signUpHref,
  socialLayout,
  socialPosition,
  socialProviders,
  submitError,
  viewPaths,
}: ReturnType<typeof useSignInController>) => (
  <Card className={cn("w-full max-w-sm", className)}>
    <CardHeader className="text-center">
      <CardTitle className="text-xl">{localization.auth.signIn}</CardTitle>
      <CardDescription>
        Sign in to continue to your organization workspace.
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

        {emailAndPassword?.enabled ? (
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
                      disabled={isPending}
                      invalid={invalid}
                      errors={field.state.meta.errors}
                    />
                  )
                }}
              </form.Field>

              <form.Field name="password">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <AuthTextField
                      name={field.name}
                      type="password"
                      autoComplete="current-password"
                      label={localization.auth.password}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onEdit={clearSubmitError}
                      onValueChange={field.handleChange}
                      placeholder={localization.auth.passwordPlaceholder}
                      disabled={isPending}
                      invalid={invalid}
                      errors={field.state.meta.errors}
                    />
                  )
                }}
              </form.Field>

              {emailAndPassword.rememberMe ? (
                <form.Field name="rememberMe">
                  {(field) => (
                    <Field className="my-1">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={field.name}
                          name={field.name}
                          checked={field.state.value}
                          disabled={isPending}
                          onCheckedChange={field.handleChange}
                        />
                        <FieldLabel
                          htmlFor={field.name}
                          className="cursor-pointer text-sm font-normal"
                        >
                          {localization.auth.rememberMe}
                        </FieldLabel>
                      </div>
                    </Field>
                  )}
                </form.Field>
              ) : null}

              {Captcha ? (
                <div className="flex justify-center">
                  <Captcha />
                </div>
              ) : null}
              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <div className="flex flex-col gap-3">
                <form.Subscribe selector={selectCanSubmit}>
                  {(canSubmit) => (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={isPending || !canSubmit}
                    >
                      {signInEmailPending ? <Spinner /> : null}
                      {localization.auth.signIn}
                      <ArrowRightIcon
                        data-icon="inline-end"
                        aria-hidden="true"
                      />
                    </Button>
                  )}
                </form.Subscribe>
                <PasskeySignInButton />
                {plugins.flatMap((plugin) =>
                  (plugin.authButtons ?? []).map((AuthButton, index) => (
                    <AuthButton
                      key={`${plugin.id}-${index.toString()}`}
                      view="signIn"
                    />
                  ))
                )}
              </div>
            </FieldGroup>
          </form>
        ) : null}

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
        {emailAndPassword?.forgotPassword ? (
          <Link
            href={`${basePaths.auth}/${viewPaths.auth.forgotPassword}`}
            prefetch={false}
            className="self-center text-sm underline-offset-4 hover:underline"
          >
            {localization.auth.forgotPasswordLink}
          </Link>
        ) : null}
        {emailAndPassword?.enabled ? (
          <FieldDescription className="text-center">
            {localization.auth.needToCreateAnAccount}{" "}
            <Link
              href={signUpHref}
              prefetch={false}
              className="underline underline-offset-4"
            >
              {localization.auth.signUp}
            </Link>
          </FieldDescription>
        ) : null}
      </div>
    </CardContent>
  </Card>
)

export function SignIn(props: SignInProps) {
  const controller = useSignInController(props)
  return <SignInCard {...controller} />
}
