import type {
  MagicLinkAuthClient,
  MultiSessionAuthClient,
  PasskeyAuthClient,
} from "@better-auth-ui/react"
import type { ComponentType } from "react"

const isPropertyContainer = (
  value: unknown
): value is object | ((...args: never[]) => unknown) =>
  (typeof value === "object" && value !== null) || typeof value === "function"

const nestedFunction = (value: unknown, path: readonly string[]) => {
  let current = value
  for (const segment of path) {
    if (!isPropertyContainer(current)) return false
    current = Reflect.get(current, segment)
  }
  return typeof current === "function"
}

const isMagicLinkAuthClient = (value: unknown): value is MagicLinkAuthClient =>
  nestedFunction(value, ["signIn", "magicLink"])

const isMultiSessionAuthClient = (
  value: unknown
): value is MultiSessionAuthClient =>
  nestedFunction(value, ["getSession"]) &&
  nestedFunction(value, ["multiSession", "listDeviceSessions"]) &&
  nestedFunction(value, ["multiSession", "setActive"]) &&
  nestedFunction(value, ["multiSession", "revoke"])

const isPasskeyAuthClient = (value: unknown): value is PasskeyAuthClient =>
  nestedFunction(value, ["signIn", "passkey"]) &&
  nestedFunction(value, ["passkey", "listUserPasskeys"]) &&
  nestedFunction(value, ["passkey", "addPasskey"]) &&
  nestedFunction(value, ["passkey", "deletePasskey"])

export const requireMagicLinkAuthClient = (
  value: unknown
): MagicLinkAuthClient => {
  if (isMagicLinkAuthClient(value)) return value
  throw new Error("Magic link authentication is not configured")
}

export const requireMultiSessionAuthClient = (
  value: unknown
): MultiSessionAuthClient => {
  if (isMultiSessionAuthClient(value)) return value
  throw new Error("Account switching is not configured")
}

export const requirePasskeyAuthClient = (value: unknown): PasskeyAuthClient => {
  if (isPasskeyAuthClient(value)) return value
  throw new Error("Passkey authentication is not configured")
}

export const findCaptchaComponent = (
  plugins: readonly unknown[]
): ComponentType | undefined => {
  for (const plugin of plugins) {
    if (!isPropertyContainer(plugin)) continue
    const component = Reflect.get(plugin, "captchaComponent")
    if (typeof component === "function") return component
  }
  return undefined
}

export const formDataString = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === "string" ? value : ""
}
