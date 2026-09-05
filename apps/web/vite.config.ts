import { fileURLToPath, URL } from "node:url"

import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import fumadocsMdx from "fumadocs-mdx/vite"
import { defineConfig } from "vite"

const webWorkerVariableKeys = [
  "API_PUBLIC_URL",
  "DEV_SESSION_ID",
  "DEV_WORKTREE_ID",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "PLAYWRIGHT_TEST",
  "VITE_API_BASE_URL",
  "VITEST",
] as const

type WebWorkerVariable = (typeof webWorkerVariableKeys)[number] | "NODE_ENV"

export const createWebWorkerVariables = (
  environment: NodeJS.ProcessEnv,
  mode: string
): Partial<Record<WebWorkerVariable, string>> => {
  const variables: Partial<Record<WebWorkerVariable, string>> = {
    NODE_ENV: environment.NODE_ENV ?? mode,
  }

  for (const key of webWorkerVariableKeys) {
    const value = environment[key]
    if (value !== undefined) variables[key] = value
  }

  return variables
}

export default defineConfig(({ mode }) => ({
  plugins: [
    cloudflare({
      config: { vars: createWebWorkerVariables(process.env, mode) },
      viteEnvironment: { name: "ssr" },
    }),
    fumadocsMdx(),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      collections: fileURLToPath(new URL("./.source", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    watch: {
      // Avoid macOS fsevents batching without falling back to CPU-heavy polling.
      useFsEvents: false,
      usePolling: false,
    },
  },
}))
