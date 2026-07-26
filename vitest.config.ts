import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: [".codex/**/*.test.ts", ".github/**/*.test.ts"],
  },
})
