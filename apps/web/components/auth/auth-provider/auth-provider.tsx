import {
  AuthProvider as AuthProviderPrimitive,
  type AuthProviderProps,
} from "@better-auth-ui/react"
import type { ComponentType, PropsWithChildren, ReactNode } from "react"

declare module "@better-auth-ui/core" {
  interface AuthConfig {
    /**
     * React component used to render internal navigation links.
     * Typically TanStack Router's `Link` or Next.js's `Link`.
     */
    Link: ComponentType<
      PropsWithChildren<{
        className?: string
        href: string
        prefetch?: boolean
        to?: string
      }>
    >
  }

  /** Widen `AdditionalField.label` to `ReactNode` in the shadcn package. */
  interface AdditionalFieldRegister {
    label: ReactNode
  }
}

/**
 * Provides the configured authentication context and renders `children` inside it.
 *
 * @param children - React nodes to render inside the authentication provider
 * @returns A React element that renders an authentication provider configured with the provided props and toast handler
 */
export function AuthProvider({ children, ...config }: AuthProviderProps) {
  return <AuthProviderPrimitive {...config}>{children}</AuthProviderPrimitive>
}
