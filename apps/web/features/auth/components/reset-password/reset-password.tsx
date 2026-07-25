"use client"

import { useAuth, useResetPassword } from "@better-auth-ui/react"
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
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useForm } from "@tanstack/react-form"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { toast } from "sonner"

import {
  safeAuthErrorMessage,
  createResetPasswordFormSchema,
} from "@/features/auth"

import {
  AuthPasswordField,
  selectCanSubmit,
} from "../auth-form-field/auth-form-field"

export type ResetPasswordProps = {
  className?: string
}

const defaultMinimumPasswordLength = 8
const defaultMaximumPasswordLength = 128
const requestFailedMessage =
  "We could not reset your password. Request a new reset link and try again."

export function ResetPassword({ className }: ResetPasswordProps) {
  const {
    authClient,
    basePaths,
    emailAndPassword,
    localization,
    viewPaths,
    navigate,
    Link,
  } = useAuth()
  const [token, setToken] = useState<string | null>()
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false)
  const [submitError, setSubmitError] = useState<string>()
  const minimumPasswordLength =
    emailAndPassword?.minPasswordLength ?? defaultMinimumPasswordLength
  const maximumPasswordLength =
    emailAndPassword?.maxPasswordLength ?? defaultMaximumPasswordLength
  const formSchema = useMemo(
    () =>
      createResetPasswordFormSchema({
        confirmPassword: emailAndPassword?.confirmPassword ?? false,
        minimumPasswordLength,
        maximumPasswordLength,
        passwordsDoNotMatchMessage: localization.auth.passwordsDoNotMatch,
      }),
    [
      emailAndPassword?.confirmPassword,
      localization.auth.passwordsDoNotMatch,
      maximumPasswordLength,
      minimumPasswordLength,
    ]
  )

  const { mutate: resetPassword, isPending } = useResetPassword(authClient, {
    onError: (error) => {
      const message = safeAuthErrorMessage(error, requestFailedMessage)
      setSubmitError(message)
    },
    onSuccess: () => {
      toast.success(localization.auth.passwordResetSuccess)
      navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` })
    },
  })
  const form = useForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => {
      if (!token) {
        const message = localization.auth.invalidResetPasswordToken
        setSubmitError(message)
        return
      }
      setSubmitError(undefined)
      resetPassword({ token, newPassword: value.password })
    },
  })

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get("token")
    setToken(resetToken)
    if (!resetToken) {
      toast.error(localization.auth.invalidResetPasswordToken)
      navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` })
    }
  }, [
    basePaths.auth,
    localization.auth.invalidResetPasswordToken,
    navigate,
    viewPaths.auth.signIn,
  ])

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

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {localization.auth.resetPassword}
        </CardTitle>
        <CardDescription>
          Choose a unique password you do not use elsewhere.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {token === null ? (
          <FieldError>{localization.auth.invalidResetPasswordToken}</FieldError>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <FieldGroup>
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
                      placeholder={localization.auth.newPasswordPlaceholder}
                      disabled={isPending || token === undefined}
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

              {emailAndPassword?.confirmPassword ? (
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
                        disabled={isPending || token === undefined}
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

              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <form.Subscribe selector={selectCanSubmit}>
                {(canSubmit) => (
                  <Button
                    type="submit"
                    disabled={isPending || token === undefined || !canSubmit}
                  >
                    {isPending ? <Spinner /> : null}
                    {localization.auth.resetPassword}
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        )}

        <div className="mt-4 flex w-full flex-col items-center gap-3">
          <FieldDescription className="text-center">
            {localization.auth.rememberYourPassword}{" "}
            <Link
              href={`${basePaths.auth}/${viewPaths.auth.signIn}`}
              className="underline underline-offset-4"
            >
              {localization.auth.signIn}
            </Link>
          </FieldDescription>
        </div>
      </CardContent>
    </Card>
  )
}
