import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthRouteScope } from "../auth-route-scope/auth-route-scope"
import { PasskeySignInButton } from "../passkey-sign-in-button/passkey-sign-in-button"
import { ProviderButton } from "../provider-button/provider-button"
import { SignOut } from "../sign-out/sign-out"

type AuthError = {
  error: { code: string; message: string }
}

type ErrorOptions = {
  onError: (error: AuthError) => void
}

const mocks = vi.hoisted(() => ({
  cancelQueries: vi.fn<() => Promise<void>>(),
  clearQueryCache: vi.fn<() => void>(),
  navigate: vi.fn<(input: { replace?: boolean; to: string }) => void>(),
  passkey: vi.fn<(input: unknown) => Promise<void>>(),
  push: vi.fn<(to: string) => void>(),
  refresh: vi.fn<() => void>(),
  signOut: vi.fn<() => void>(),
  socialSignIn: vi.fn<(input: unknown) => void>(),
  toastError: vi.fn<(message: string) => void>(),
}))

const providerSecretError: AuthError = {
  error: {
    code: "INTERNAL_ERROR",
    message: "BETTER_AUTH_SECRET=provider-secret",
  },
}

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useIsMutating: () => 0,
  useQueryClient: () => ({
    cancelQueries: mocks.cancelQueries,
    clear: mocks.clearQueryCache,
  }),
}))

vi.mock("@better-auth-ui/react", () => ({
  providerIcons: {},
  useAuth: () => ({
    authClient: { signIn: { passkey: mocks.passkey } },
    basePaths: { auth: "/auth" },
    localization: { auth: { continueWith: "Continue with {{provider}}" } },
    navigate: mocks.navigate,
    redirectTo: "/dashboard",
    viewPaths: { auth: { signIn: "sign-in" } },
  }),
  useSignInSocial: (_client: unknown, options: ErrorOptions) => ({
    isPending: false,
    mutate: (input: unknown) => {
      mocks.socialSignIn(input)
      options.onError(providerSecretError)
    },
  }),
  useSignOut: (_client: unknown, options: ErrorOptions) => ({
    mutate: () => {
      mocks.signOut()
      options.onError(providerSecretError)
    },
  }),
}))

describe("authentication action errors", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cancelQueries.mockResolvedValue()
    mocks.passkey.mockImplementation(async (input) => {
      if (typeof input !== "object" || input === null) {
        throw new Error("Expected passkey input")
      }
      const fetchOptions = Reflect.get(input, "fetchOptions")
      if (typeof fetchOptions !== "object" || fetchOptions === null) {
        throw new Error("Expected passkey fetch options")
      }
      const onError = Reflect.get(fetchOptions, "onError")
      if (typeof onError !== "function") {
        throw new Error("Expected passkey error handler")
      }
      Reflect.apply(onError, undefined, [providerSecretError])
      throw new Error("DATABASE_URL=file:private.db")
    })
  })

  it("shows one safe social sign-in error", async () => {
    const actor = userEvent.setup()
    render(<ProviderButton provider="github" />)

    await actor.click(screen.getByRole("button", { name: "GitHub" }))

    expect(mocks.toastError).toHaveBeenCalledOnce()
    expect(mocks.toastError).toHaveBeenCalledWith(
      "GitHub sign-in could not be started. Try again."
    )
  })

  it("uses the route-scoped invitation callback for social sign-in", async () => {
    const actor = userEvent.setup()
    render(
      <AuthRouteScope
        addingAccount
        reauthenticating={false}
        redirectTo="/invitations/invitation-new-user"
      >
        <ProviderButton provider="github" />
      </AuthRouteScope>
    )

    await actor.click(screen.getByRole("button", { name: "GitHub" }))

    expect(mocks.socialSignIn).toHaveBeenCalledWith({
      callbackURL: "http://localhost:3000/invitations/invitation-new-user",
      provider: "github",
    })
  })

  it("shows one safe passkey sign-in error", async () => {
    const actor = userEvent.setup()
    render(<PasskeySignInButton />)

    await actor.click(
      screen.getByRole("button", { name: "Sign in with passkey" })
    )

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Passkey sign-in failed. Try again."
    )
    expect(mocks.cancelQueries).toHaveBeenCalledOnce()
    expect(mocks.clearQueryCache).toHaveBeenCalledOnce()
    expect(mocks.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.passkey.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it("returns a successful passkey sign-in to the scoped invitation", async () => {
    mocks.passkey.mockImplementationOnce(async (input) => {
      if (typeof input !== "object" || input === null) {
        throw new Error("Expected passkey input")
      }
      const fetchOptions = Reflect.get(input, "fetchOptions")
      if (typeof fetchOptions !== "object" || fetchOptions === null) {
        throw new Error("Expected passkey fetch options")
      }
      const onSuccess = Reflect.get(fetchOptions, "onSuccess")
      if (typeof onSuccess !== "function") {
        throw new Error("Expected passkey success handler")
      }
      Reflect.apply(onSuccess, undefined, [])
    })
    const actor = userEvent.setup()
    render(
      <AuthRouteScope
        addingAccount={false}
        reauthenticating={false}
        redirectTo="/invitations/invitation-new-user"
      >
        <PasskeySignInButton />
      </AuthRouteScope>
    )

    await actor.click(
      screen.getByRole("button", { name: "Sign in with passkey" })
    )

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/invitations/invitation-new-user"
      )
    )
    expect(mocks.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.passkey.mock.invocationCallOrder[0] ?? 0
    )
  })

  it("shows one safe sign-out error and returns to sign-in", async () => {
    render(<SignOut />)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(mocks.toastError).toHaveBeenCalledWith("Sign out failed. Try again.")
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/auth/sign-in",
      replace: true,
    })
    expect(mocks.cancelQueries).toHaveBeenCalledOnce()
    expect(mocks.clearQueryCache).toHaveBeenCalledOnce()
    expect(mocks.cancelQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
