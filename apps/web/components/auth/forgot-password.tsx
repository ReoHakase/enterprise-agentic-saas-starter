"use client"

import { useAuth, useRequestPasswordReset } from "@better-auth-ui/react"
import { Button } from "@enterprise-agentic-saas/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@enterprise-agentic-saas/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@enterprise-agentic-saas/ui/components/field"
import { Input } from "@enterprise-agentic-saas/ui/components/input"
import { Label } from "@enterprise-agentic-saas/ui/components/label"
import { Spinner } from "@enterprise-agentic-saas/ui/components/spinner"
import { cn } from "@enterprise-agentic-saas/ui/lib/utils"
import { type ComponentType, type SyntheticEvent, useState } from "react"
import { toast } from "sonner"

import { useFetchOptions } from "@/lib/auth/fetch-options"

export type ForgotPasswordProps = {
  className?: string
}

/**
 * Render a card-based "Forgot Password" form that sends a password-reset email.
 *
 * The form displays an email input, submit button, and a link back to sign-in.
 * Toasts are displayed on success or error via the `useForgotPassword` hook.
 *
 * @param className - Optional additional CSS class names applied to the card
 * @returns The forgot-password form UI as a JSX element
 */
export function ForgotPassword({ className }: ForgotPasswordProps) {
  const { authClient, basePaths, localization, plugins, viewPaths, Link } =
    useAuth()

  const { fetchOptions, resetFetchOptions } = useFetchOptions()

  const { mutate: requestPasswordReset, isPending } = useRequestPasswordReset(
    authClient,
    {
      onError: (error) => {
        toast.error(error.error?.message || error.message)
        resetFetchOptions()
      },
      onSuccess: () => toast.success(localization.auth.passwordResetEmailSent),
    }
  )

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    requestPasswordReset({
      email: formData.get("email") as string,
      fetchOptions,
    })
  }

  const Captcha = plugins.find((plugin) => plugin.captchaComponent)
    ?.captchaComponent as ComponentType | undefined

  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
  }>({})

  return (
    <Card className={cn("w-full max-w-sm", className)}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {localization.auth.forgotPassword}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={!!fieldErrors.email}>
              <Label htmlFor="email">{localization.auth.email}</Label>

              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={localization.auth.emailPlaceholder}
                required
                disabled={isPending}
                onChange={() => {
                  setFieldErrors((prev) => ({
                    ...prev,
                    email: undefined,
                  }))
                }}
                onInvalid={(e) => {
                  e.preventDefault()

                  setFieldErrors((prev) => ({
                    ...prev,
                    email: (e.target as HTMLInputElement).validationMessage,
                  }))
                }}
                aria-invalid={!!fieldErrors.email}
              />

              <FieldError>{fieldErrors.email}</FieldError>
            </Field>

            {Captcha && (
              <div className="flex justify-center">
                <Captcha />
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending && <Spinner />}

                {localization.auth.sendResetLink}
              </Button>
            </div>
          </FieldGroup>
        </form>

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
