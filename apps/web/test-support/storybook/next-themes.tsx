"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"

type ThemeValue = {
  resolvedTheme?: string
  setTheme: (theme: string) => void
  systemTheme?: string
  theme?: string
  themes: string[]
}

const themes = ["light", "dark", "system"]
const ThemeContext = createContext<ThemeValue>({
  resolvedTheme: "light",
  setTheme: () => undefined,
  systemTheme: "light",
  theme: "light",
  themes,
})

const resolveSystemTheme = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

export const ThemeProvider = ({
  children,
  defaultTheme = "system",
}: PropsWithChildren<{ defaultTheme?: string }>) => {
  const [theme, setTheme] = useState(() => {
    if (document.documentElement.classList.contains("dark")) return "dark"
    if (document.documentElement.classList.contains("light")) return "light"
    return defaultTheme
  })
  const systemTheme = resolveSystemTheme()
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.classList.toggle(
      "light",
      resolvedTheme === "light"
    )
  }, [resolvedTheme])

  const value = useMemo(
    () => ({ resolvedTheme, setTheme, systemTheme, theme, themes }),
    [resolvedTheme, systemTheme, theme]
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export const useTheme = () => useContext(ThemeContext)
