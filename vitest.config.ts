import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
    },
    include: [".github/**/*.test.ts", "scripts/**/*.test.ts"],
  },
})
