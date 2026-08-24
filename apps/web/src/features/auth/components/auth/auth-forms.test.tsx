import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { AnchorHTMLAttributes } from "react"
import { renderToString } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthRouteScope } from "../auth-route-scope/auth-route-scope"
import { MagicLink } from "../magic-link/magic-link"
import { ResetPassword } from "../reset-password/reset-password"
import { SignIn } from "../sign-in/sign-in"
import { SignUp } from "../sign-up/sign-up"

const authMocks = vi.hoisted(() => ({
  failSignIn: true,
  failSignUp: true,
  magicLinkRequest: vi.fn<(input: unknown) => void>(),
  navigate: vi.fn<(input: { to: string }) => void>(),
  signInRequest: vi.fn<(input: unknown) => void>(),
  signUpRequest: vi.fn<(input: unknown) => void>(),
  toastError: vi.fn<(message: string, options?: unknown) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
}))

vi.mock("sonner", () => ({
  toast: {
    error: authMocks.toastError,
    success: authMocks.toastSuccess,
  },
}))

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useIsMutating: () => 0,
}))

vi.mock("../passkey-sign-in-button/passkey-sign-in-button", () => ({
  PasskeySignInButton: () => null,
}))

vi.mock("@better-auth-ui/react", () => {
  type SignInInput = {
    email: string
    password: string
    rememberMe?: boolean
  }
  type SignUpInput = {
    email: string
    name: string
    password: string
  }
  type SignInOptions = {
    onError: (
      error: { error: { code: string; message: string } },
      input: SignInInput
    ) => void
    onSuccess: () => void
  }
  type SignUpOptions = {
    onError: (error: { error: { code: string; message: string } }) => void
    onSuccess: () => void
  }
  type MagicLinkInput = {
    callbackURL: string
    email: string
  }
  type MagicLinkOptions = {
    onSuccess: () => void
  }

  return {
    useAuth: () => ({
      additionalFields: [],
      authClient: {
        signIn: { magicLink: () => undefined },
      },
      basePaths: { auth: "/auth" },
      emailAndPassword: {
        enabled: true,
        confirmPassword: true,
        forgotPassword: true,
        maxPasswordLength: 128,
        minPasswordLength: 8,
        name: true,
        rememberMe: true,
        requireEmailVerification: false,
      },
      Link: ({
        children,
        prefetch: _prefetch,
        ...props
      }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
        <a {...props}>{children}</a>
      ),
      localization: {
        auth: {
          alreadyHaveAnAccount: "Already have an account?",
          confirmPassword: "Confirm password",
          confirmPasswordPlaceholder: "Confirm your password",
          email: "Email",
          emailPlaceholder: "name@example.com",
          forgotPasswordLink: "Forgot password?",
          hidePassword: "Hide password",
          name: "Name",
          namePlaceholder: "Your name",
          needToCreateAnAccount: "Need an account?",
          or: "or",
          password: "Password",
          passwordPlaceholder: "Your password",
          passwordResetSuccess: "Password reset",
          passwordsDoNotMatch: "Passwords do not match.",
          rememberMe: "Remember me",
          resend: "Resend",
          showPassword: "Show password",
          signIn: "Sign in",
          signUp: "Create account",
          invalidResetPasswordToken: "Invalid reset password token",
          newPasswordPlaceholder: "Your new password",
          resetPassword: "Reset password",
          verificationEmailSent: "Verification email sent",
          checkYourEmail: "Check your email",
        },
      },
      navigate: authMocks.navigate,
      plugins: [],
      redirectTo: "/dashboard",
      socialProviders: [],
      viewPaths: {
        auth: {
          forgotPassword: "forgot-password",
          resetPassword: "reset-password",
          signIn: "sign-in",
          signUp: "sign-up",
        },
      },
    }),
    useAuthPlugin: () => ({
      localization: {
        magicLinkSent: "Magic link sent",
        sendMagicLink: "Send magic link",
      },
    }),
    useFetchOptions: () => ({
      fetchOptions: undefined,
      resetFetchOptions: vi.fn<() => void>(),
    }),
    useSendVerificationEmail: () => ({
      mutate: vi.fn<(input: unknown) => void>(),
    }),
    useSignInMagicLink: (_client: unknown, options: MagicLinkOptions) => ({
      isPending: false,
      mutate: (input: MagicLinkInput) => {
        authMocks.magicLinkRequest(input)
        options.onSuccess()
      },
    }),
    useSignInEmail: (_client: unknown, options: SignInOptions) => ({
      isPending: false,
      mutate: (input: SignInInput) => {
        authMocks.signInRequest(input)
        if (authMocks.failSignIn) {
          options.onError(
            {
              error: {
                code: "INVALID_EMAIL_OR_PASSWORD",
                message: "provider secret",
              },
            },
            input
          )
        } else {
          options.onSuccess()
        }
      },
    }),
    useSignUpEmail: (_client: unknown, options: SignUpOptions) => ({
      isPending: false,
      mutate: (input: SignUpInput) => {
        authMocks.signUpRequest(input)
        if (authMocks.failSignUp) {
          options.onError({
            error: {
              code: "USER_ALREADY_EXISTS",
              message: "provider secret",
            },
          })
        } else {
          options.onSuccess()
        }
      },
    }),
    useResetPassword: () => ({
      isPending: false,
      mutate: vi.fn<(input: unknown) => void>(),
    }),
  }
})

beforeEach(() => {
  authMocks.failSignIn = true
  authMocks.failSignUp = true
  vi.clearAllMocks()
})

describe("メールアドレス・パスワード認証フォーム", () => {
  it("ハイドレーションまでマジックリンクフォームを操作不能にする", async () => {
    const container = document.createElement("div")
    container.innerHTML = renderToString(<MagicLink />)
    document.body.appendChild(container)

    expect(within(container).getByLabelText("Email")).toBeDisabled()

    const user = userEvent.setup()
    render(<MagicLink />, { container, hydrate: true })
    const email = screen.getByLabelText("Email")
    await waitFor(() => expect(email).toBeEnabled())

    await user.type(email, "new@example.com")
    await user.click(screen.getByRole("button", { name: "Send magic link" }))

    expect(authMocks.magicLinkRequest).toHaveBeenCalledWith({
      callbackURL: "http://localhost:3000/dashboard",
      email: "new@example.com",
    })
  })

  it("アカウント追加用マジックリンク画面でも招待の戻り先を保持する", async () => {
    const user = userEvent.setup()
    const invitationPath = "/invitations/invitation-new-user"
    render(
      <AuthRouteScope
        addingAccount
        reauthenticating
        redirectTo={invitationPath}
      >
        <MagicLink />
      </AuthRouteScope>
    )

    expect(
      screen.getByRole("link", { name: "Create account" })
    ).toHaveAttribute(
      "href",
      "/auth/sign-up?redirectTo=%2Finvitations%2Finvitation-new-user&add_account=1"
    )
    const email = screen.getByLabelText("Email")
    await waitFor(() => expect(email).toBeEnabled())
    await user.type(email, "new-user@example.com")
    await user.click(screen.getByRole("button", { name: "Send magic link" }))

    expect(authMocks.magicLinkRequest).toHaveBeenCalledWith({
      callbackURL: "http://localhost:3000/invitations/invitation-new-user",
      email: "new-user@example.com",
    })
  })

  it("アカウント作成からサインインへ戻ってもアカウント追加状態を保持する", () => {
    render(
      <AuthRouteScope
        addingAccount
        reauthenticating={false}
        redirectTo="/invitations/invitation-new-user"
      >
        <MagicLink mode="sign-up" />
      </AuthRouteScope>
    )

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?redirectTo=%2Finvitations%2Finvitation-new-user&add_account=1"
    )
  })

  it("リセットトークンがない場合はサインインへ戻す", async () => {
    window.history.replaceState({}, "", window.location.pathname)

    render(<ResetPassword />)

    await waitFor(() =>
      expect(authMocks.navigate).toHaveBeenCalledWith({ to: "/auth/sign-in" })
    )
  })

  it("空のサインイン項目をローカル検証する", async () => {
    const user = userEvent.setup()
    render(<SignIn />)

    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByText("Enter your email address.")).toBeVisible()
    expect(authMocks.signInRequest).not.toHaveBeenCalled()
  })

  it("認証失敗後も入力した認証情報を保持する", async () => {
    const user = userEvent.setup()
    render(<SignIn />)

    const email = screen.getByLabelText("Email")
    const password = screen.getByLabelText("Password")
    await user.type(email, "user@example.test")
    await user.type(password, "correct-password")
    await user.click(screen.getByRole("checkbox", { name: "Remember me" }))
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(authMocks.signInRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.test",
        password: "correct-password",
        rememberMe: true,
      })
    )
    expect(email).toHaveValue("user@example.test")
    expect(password).toHaveValue("correct-password")
  })

  it("送信せずにサインアップ確認エラーを表示する", async () => {
    const user = userEvent.setup()
    render(<SignUp />)

    await user.type(screen.getByLabelText("Name"), "Test User")
    await user.type(screen.getByLabelText("Email"), "user@example.test")
    await user.type(screen.getByLabelText("Password"), "correct-password")
    await user.type(
      screen.getByLabelText("Confirm password"),
      "different-password"
    )
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Passwords do not match.")).toBeVisible()
    expect(authMocks.signUpRequest).not.toHaveBeenCalled()
  })

  it("サインアップ内容を送信し、安全な失敗後も入力値を保持する", async () => {
    const user = userEvent.setup()
    render(<SignUp />)

    const name = screen.getByLabelText("Name")
    const email = screen.getByLabelText("Email")
    const password = screen.getByLabelText("Password")
    const confirmation = screen.getByLabelText("Confirm password")
    await user.type(name, "Test User")
    await user.type(email, "user@example.test")
    await user.type(password, "correct-password")
    await user.type(confirmation, "correct-password")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(authMocks.signUpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.test",
        name: "Test User",
        password: "correct-password",
      })
    )
    expect(name).toHaveValue("Test User")
    expect(email).toHaveValue("user@example.test")
    expect(password).toHaveValue("correct-password")
    expect(confirmation).toHaveValue("correct-password")
  })
})
