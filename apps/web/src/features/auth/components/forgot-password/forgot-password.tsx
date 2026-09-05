"use client"

import {
  useAuth,
  useFetchOptions,
  useRequestPasswordReset,
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
} from "@enterprise-agentic-saas/ui/components/field"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { useForm } from "@tanstack/react-form"
import { MailCheckIcon } from "lucide-react"
import { type FormEvent, useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { safeAuthErrorMessage, forgotPasswordFormSchema } from "@/features/auth"

import { findCaptchaComponent } from "../../runtime-guards"
import { AuthTextField } from "../auth-form-field/auth-form-field"
import { selectCanSubmit } from "../auth-form-field/form-selectors"

export type ForgotPasswordProps = {
  className?: string
}

const requestFailedMessage =
  "We could not request a reset link. Check your email and try again."

export function ForgotPassword({ className }: ForgotPasswordProps) {
  const { authClient, basePaths, localization, plugins, viewPaths, Link } =
    useAuth()
  const { fetchOptions, resetFetchOptions } = useFetchOptions()
  const requestedEmail = useRef("")
  const [sentTo, setSentTo] = useState<string>()
  const [submitError, setSubmitError] = useState<string>()

  const { mutate: requestPasswordReset, isPending } = useRequestPasswordReset(
    authClient,
    {
      onError: (error) => {
        const message = safeAuthErrorMessage(error, requestFailedMessage)
        setSubmitError(message)
        resetFetchOptions()
      },
      onSuccess: () => {
        setSentTo(requestedEmail.current)
        toast.success(localization.auth.passwordResetEmailSent)
      },
    }
  )
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: forgotPasswordFormSchema },
    onSubmit: ({ value }) => {
      setSubmitError(undefined)
      requestedEmail.current = value.email
      requestPasswordReset({ email: value.email, fetchOptions })
    },
  })
  const Captcha = findCaptchaComponent(plugins)

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit()
    },
    [form]
  )
  const clearSubmitError = useCallback(() => setSubmitError(undefined), [])
  const tryAnotherEmail = useCallback(() => {
    setSentTo(undefined)
    setSubmitError(undefined)
    form.reset()
  }, [form])

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {localization.auth.forgotPassword}
        </CardTitle>
        <CardDescription>
          Enter the email associated with your account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sentTo ? (
          <div
            className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 p-5 text-center"
            role="status"
          >
            <MailCheckIcon className="size-8 text-primary" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                If an account exists for <strong>{sentTo}</strong>, a password
                reset link is on its way.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={tryAnotherEmail}>
              Try another email
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
                      disabled={isPending}
                      invalid={invalid}
                      errors={field.state.meta.errors}
                    />
                  )
                }}
              </form.Field>

              {Captcha ? (
                <div className="flex justify-center">
                  <Captcha />
                </div>
              ) : null}
              {submitError ? <FieldError>{submitError}</FieldError> : null}

              <form.Subscribe selector={selectCanSubmit}>
                {(canSubmit) => (
                  <Button type="submit" disabled={isPending || !canSubmit}>
                    {isPending ? <Spinner /> : null}
                    {localization.auth.sendResetLink}
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
