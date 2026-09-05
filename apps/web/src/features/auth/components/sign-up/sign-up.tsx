"use client"

import {
  authMutationKeys,
  parseAdditionalFieldValue,
} from "@better-auth-ui/core"
import { useAuth, useFetchOptions, useSignUpEmail } from "@better-auth-ui/react"
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
import { type FormEvent, useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage, createSignUpFormSchema } from "@/features/auth"
import { reportObservedError } from "@/lib/report-observed-error"

import { findCaptchaComponent, formDataString } from "../../runtime-guards"
import { AdditionalField } from "../additional-field/additional-field"
import {
  AuthPasswordField,
  AuthTextField,
} from "../auth-form-field/auth-form-field"
import { selectCanSubmit } from "../auth-form-field/form-selectors"
import { createScopedAuthViewHref } from "../auth-route-scope/auth-route-href"
import { useAuthRouteState } from "../auth-route-scope/auth-route-scope"
import {
  ProviderButtons,
  type SocialLayout,
} from "../provider-buttons/provider-buttons"

export type SignUpProps = {
  className?: string
  socialLayout?: SocialLayout
  socialPosition?: "top" | "bottom"
}

const defaultMinimumPasswordLength = 8
const defaultMaximumPasswordLength = 128
const signUpFailedMessage =
  "We could not create your account. Check the form and try again."
const additionalFieldFailedMessage =
  "Check the additional account details and try again."

const useSignUpController = ({
  className,
  socialLayout,
  socialPosition = "bottom",
}: SignUpProps) => {
  const {
    additionalFields,
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
  const formElement = useRef<HTMLFormElement>(null)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const minimumPasswordLength =
    emailAndPassword?.minPasswordLength ?? defaultMinimumPasswordLength
  const maximumPasswordLength =
    emailAndPassword?.maxPasswordLength ?? defaultMaximumPasswordLength
  const requireName = emailAndPassword?.name !== false
  const formSchema = useMemo(
    () =>
      createSignUpFormSchema({
        confirmPassword: emailAndPassword?.confirmPassword ?? false,
        minimumPasswordLength,
        maximumPasswordLength,
        passwordsDoNotMatchMessage: localization.auth.passwordsDoNotMatch,
        requireName,
      }),
    [
      emailAndPassword?.confirmPassword,
      localization.auth.passwordsDoNotMatch,
      maximumPasswordLength,
      minimumPasswordLength,
      requireName,
    ]
  )

  const { mutate: signUpEmail, isPending: signUpEmailPending } = useSignUpEmail(
    authClient,
    {
      onError: (error) => {
        const message = safeAuthErrorMessage(error, signUpFailedMessage)
        setSubmitError(message)
        resetFetchOptions()
      },
      onSuccess: () => {
        if (emailAndPassword?.requireEmailVerification) {
          toast.success(localization.auth.checkYourEmail)
          navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` })
        } else {
          navigate({ to: redirectTo })
        }
      },
    }
  )
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(undefined)
      const element = formElement.current
      if (!element) {
        setSubmitError(signUpFailedMessage)
        return
      }
      const formData = new FormData(element)
      let additionalFieldEntries: [string, unknown][]
      try {
        const additionalFieldChecks: Array<
          Promise<[string, unknown] | undefined>
        > = []
        for (const field of additionalFields ?? []) {
          if (!field.signUp || field.readOnly) continue
          additionalFieldChecks.push(
            (async (): Promise<[string, unknown] | undefined> => {
              const additionalValue = parseAdditionalFieldValue(
                field,
                formDataString(formData, field.name)
              )
              await field.validate?.(additionalValue)
              return additionalValue === undefined
                ? undefined
                : [field.name, additionalValue]
            })()
          )
        }
        additionalFieldEntries = await Promise.all(additionalFieldChecks).then(
          (entries) =>
            entries.filter(
              (entry): entry is [string, unknown] => entry !== undefined
            )
        )
      } catch (error) {
        reportObservedError(error, { operation: "auth.signup.validate" })
        setSubmitError(additionalFieldFailedMessage)
        return
      }
      const additionalFieldValues = Object.fromEntries(additionalFieldEntries)

      signUpEmail({
        name: requireName ? value.name : "",
        email: value.email,
        password: value.password,
        ...additionalFieldValues,
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
  const isPending = signUpEmailPending || signInMutating + signUpMutating > 0
  const Captcha = findCaptchaComponent(plugins)
  const showSeparator =
    emailAndPassword?.enabled && socialProviders && socialProviders.length > 0
  const signInHref = createScopedAuthViewHref({
    basePath: basePaths.auth,
    preserveReauthentication: true,
    route: authRoute,
    viewPath: viewPaths.auth.signIn,
  })

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const clearSubmitError = useCallback(() => setSubmitError(undefined), [])
  const togglePassword = useCallback(
    () => setIsPasswordVisible((visible) => !visible),
    []
  )
  const toggleConfirmPassword = useCallback(
    () => setIsConfirmPasswordVisible((visible) => !visible),
    []
  )

  return {
    Captcha,
    Link,
    additionalFields,
    className,
    clearSubmitError,
    emailAndPassword,
    form,
    formElement,
    handleSubmit,
    isConfirmPasswordVisible,
    isPasswordVisible,
    isPending,
    localization,
    plugins,
    requireName,
    showSeparator,
    signInHref,
    signUpEmailPending,
    socialLayout,
    socialPosition,
    socialProviders,
    submitError,
    toggleConfirmPassword,
    togglePassword,
  }
}

const SignUpCard = ({
  Captcha,
  Link,
  additionalFields,
  className,
  clearSubmitError,
  emailAndPassword,
  form,
  formElement,
  handleSubmit,
  isConfirmPasswordVisible,
  isPasswordVisible,
  isPending,
  localization,
  plugins,
  requireName,
  showSeparator,
  signInHref,
  signUpEmailPending,
  socialLayout,
  socialPosition,
  socialProviders,
  submitError,
  toggleConfirmPassword,
  togglePassword,
}: ReturnType<typeof useSignUpController>) => (
  <Card className={cn("w-full max-w-sm", className)}>
    <CardHeader>
      <CardTitle className="text-xl font-semibold">
        {localization.auth.signUp}
      </CardTitle>
      <CardDescription>
        Create your account, then set up your first organization.
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
              <FieldSeparator className="flex items-center text-xs *:data-[slot=field-separator-content]:bg-card">
                {localization.auth.or}
              </FieldSeparator>
            ) : null}
          </>
        ) : null}

        {emailAndPassword?.enabled ? (
          <form ref={formElement} onSubmit={handleSubmit} noValidate>
            <FieldGroup>
              {requireName ? (
                <form.Field name="name">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <AuthTextField
                        name={field.name}
                        type="text"
                        autoComplete="name"
                        label={localization.auth.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onEdit={clearSubmitError}
                        onValueChange={field.handleChange}
                        placeholder={localization.auth.namePlaceholder}
                        disabled={isPending}
                        invalid={invalid}
                        errors={field.state.meta.errors}
                      />
                    )
                  }}
                </form.Field>
              ) : null}

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

              {additionalFields?.map((field) =>
                field.signUp === "above" ? (
                  <AdditionalField
                    key={field.name}
                    name={field.name}
                    field={field}
                    isPending={isPending}
                  />
                ) : null
              )}

              <form.Field name="password">
                {(field) => {
                  const invalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <AuthPasswordField
                      name={field.name}
                      autoComplete="new-password"
                      label={localization.auth.password}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onEdit={clearSubmitError}
                      onValueChange={field.handleChange}
                      placeholder={localization.auth.passwordPlaceholder}
                      disabled={isPending}
                      invalid={invalid}
                      errors={field.state.meta.errors}
                      visible={isPasswordVisible}
                      onToggleVisibility={togglePassword}
                      hidePasswordLabel={localization.auth.hidePassword}
                      showPasswordLabel={localization.auth.showPassword}
                    />
                  )
                }}
              </form.Field>

              {emailAndPassword.confirmPassword ? (
                <form.Field name="confirmPassword">
                  {(field) => {
                    const invalid =
                      field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <AuthPasswordField
                        name={field.name}
                        autoComplete="new-password"
                        label={localization.auth.confirmPassword}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onEdit={clearSubmitError}
                        onValueChange={field.handleChange}
                        placeholder={
                          localization.auth.confirmPasswordPlaceholder
                        }
                        disabled={isPending}
                        invalid={invalid}
                        errors={field.state.meta.errors}
                        visible={isConfirmPasswordVisible}
                        onToggleVisibility={toggleConfirmPassword}
                        hidePasswordLabel={localization.auth.hidePassword}
                        showPasswordLabel={localization.auth.showPassword}
                      />
                    )
                  }}
                </form.Field>
              ) : null}

              {additionalFields?.map((field) =>
                field.signUp && field.signUp !== "above" ? (
                  <AdditionalField
                    key={field.name}
                    name={field.name}
                    field={field}
                    isPending={isPending}
                  />
                ) : null
              )}

              {Captcha ? (
                <div className="flex justify-center">
                  <Captcha />
                </div>
              ) : null}
              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <div className="flex flex-col gap-3">
                <form.Subscribe selector={selectCanSubmit}>
                  {(canSubmit) => (
                    <Button type="submit" disabled={isPending || !canSubmit}>
                      {signUpEmailPending ? <Spinner /> : null}
                      {localization.auth.signUp}
                    </Button>
                  )}
                </form.Subscribe>
                {plugins.flatMap((plugin) =>
                  (plugin.authButtons ?? []).map((AuthButton, index) => (
                    <AuthButton
                      key={`${plugin.id}-${index.toString()}`}
                      view="signUp"
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

      {emailAndPassword?.enabled ? (
        <div className="mt-4 flex w-full flex-col items-center gap-3">
          <FieldDescription className="text-center">
            {localization.auth.alreadyHaveAnAccount}{" "}
            <Link
              href={signInHref}
              prefetch={false}
              className="underline underline-offset-4"
            >
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      ) : null}
    </CardContent>
  </Card>
)

export function SignUp(props: SignUpProps) {
  const controller = useSignUpController(props)
  return <SignUpCard {...controller} />
}
