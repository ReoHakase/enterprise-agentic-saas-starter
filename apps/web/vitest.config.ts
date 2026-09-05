import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineProject } from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineProject({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      collections: path.join(root, ".source"),
    },
  },
  test: {
    name: "web-unit",
    environment: "happy-dom",
    include: [
      "*.test.{ts,tsx}",
      "src/instrumentation*.test.ts",
      "src/{components,features,hooks,lib}/**/*.test.{ts,tsx}",
      "e2e/fixtures/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/*.browser.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
