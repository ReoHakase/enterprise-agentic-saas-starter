import path from "node:path"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineProject } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineProject({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.join(dirname, "src"),
      "next/link": path.join(dirname, "test-support/storybook/next-link.tsx"),
    },
  },
  test: {
    name: "unit",
    environment: "happy-dom",
    include: [
      "*.test.{ts,tsx}",
      "src/instrumentation*.test.ts",
      "src/{components,features,hooks,lib}/**/*.test.{ts,tsx}",
      "testing/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/*.browser.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
