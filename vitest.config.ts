import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import {
  defineConfig,
  type TestProjectInlineConfiguration,
} from "vitest/config"

const root = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.join(root, "apps/web")
const uiRoot = path.join(root, "packages/ui")
const coverageExcludes = [
  "**/*.d.ts",
  "**/*.stories.tsx",
  "**/*.test.{ts,tsx}",
  "**/*.browser.test.{ts,tsx}",
  "**/test-support/**",
]

type CoverageThresholds = {
  statements: number
  branches: number
  functions: number
  lines: number
}

type CoverageThresholdConfig = CoverageThresholds &
  Record<string, CoverageThresholds | number>

type NodeCoverageProject = {
  workspace: string
  include: string[]
  thresholds: CoverageThresholdConfig
  exclude?: string[]
}

const nodeCoverageProjects: Record<string, NodeCoverageProject> = {
  "agent-unit": {
    workspace: "apps/agent",
    include: [
      "src/mastra/core/budget/context.ts",
      "src/mastra/core/budget/tool.ts",
      "src/mastra/core/messages/chat-input.ts",
      "src/mastra/core/policy/feature-flags.ts",
      "src/mastra/core/policy/grant.ts",
      "src/mastra/core/stop-conditions/index.ts",
      "src/mastra/core/usage/normalize.ts",
      "src/mastra/runtime/request.ts",
      "src/mastra/runtime/native-stream.ts",
      "src/mastra/runtime/resume-action.ts",
      "src/mastra/runtime/settlement.ts",
      "src/mastra/tools/client/tool.ts",
      "src/mastra/tools/issues/read/execute.ts",
      "src/mastra/tools/issues/read/factories.ts",
      "src/mastra/tools/issues/tool-runtime.ts",
      "src/mastra/tools/issues/write/execute.ts",
      "src/mastra/tools/issues/write/factories.ts",
    ],
    thresholds: {
      statements: 97,
      branches: 92,
      functions: 100,
      lines: 98,
      "apps/agent/src/mastra/tools/issues/{read,write}/factories.ts": {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      "apps/agent/src/mastra/tools/issues/tool-runtime.ts": {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  "api-unit": {
    workspace: "apps/api",
    include: [
      "src/app.ts",
      "src/client.ts",
      "src/modules/organizations/routes/deletion-access.ts",
      "src/modules/organizations/deletion-jobs.ts",
      "src/platform/observability/otel-adapter.ts",
      "src/platform/plugins/request-id.ts",
    ],
    thresholds: { statements: 87, branches: 68, functions: 91, lines: 88 },
  },
  "emulate-unit": {
    workspace: "apps/emulate",
    include: ["app/**/route.ts"],
    thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  "images-unit": {
    workspace: "apps/images",
    include: ["src/worker.ts"],
    thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  "web-unit": {
    workspace: "apps/web",
    include: [
      "src/features/auth/runtime-guards.ts",
      "src/features/account/components/**/*.tsx",
      "src/features/account/multi-session-client.ts",
      "src/features/account/schema.ts",
      "src/features/account/security-client.ts",
      "src/features/auth/error.ts",
      "src/features/auth/schema.ts",
      "src/features/console/api.ts",
      "src/features/issues/api.ts",
      "src/features/issues/components/**/*.{ts,tsx}",
      "src/features/issues/schema.ts",
      "src/features/members/api.ts",
      "src/features/members/components/**/*.tsx",
      "src/features/members/schema.ts",
      "src/features/organizations/components/**/*.tsx",
      "src/features/organizations/schema.ts",
      "src/features/auth/redirect-to.ts",
      "src/lib/report-observed-error.ts",
      "src/lib/server/auth-session-response.ts",
    ],
    exclude: coverageExcludes,
    thresholds: { statements: 85, branches: 71, functions: 81, lines: 86 },
  },
  "agent-contracts-unit": {
    workspace: "packages/agent-contracts",
    include: [
      "src/chat.ts",
      "src/runtime.ts",
      "src/schemas.ts",
      "src/tools.ts",
    ],
    thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
  "auth-unit": {
    workspace: "packages/auth",
    include: [
      "src/client.ts",
      "src/github-oauth.ts",
      "src/index.ts",
      "src/server/adapters/github-user-info.ts",
      "src/server/github-oauth-environment.ts",
      "src/server/plugins/github-oauth-provider.ts",
      "src/session-organization.ts",
    ],
    thresholds: { statements: 92, branches: 90, functions: 100, lines: 92 },
  },
  "db-unit": {
    workspace: "packages/db",
    include: [
      "src/development/seed-fixtures.ts",
      "src/development/reset.ts",
      "src/development/seed.ts",
    ],
    thresholds: { statements: 94, branches: 75, functions: 93, lines: 95 },
  },
  "email-unit": {
    workspace: "packages/email",
    include: [
      "src/components/app-email.tsx",
      "src/config.ts",
      "src/providers/cloudflare.ts",
      "src/providers/configured.ts",
      "src/providers/console.ts",
      "src/providers/mailpit.ts",
      "src/providers/noop.ts",
      "src/render/index.ts",
      "src/templates/magic-link.tsx",
      "src/templates/organization-invitation.tsx",
      "src/templates/verification.tsx",
    ],
    thresholds: { statements: 97, branches: 89, functions: 100, lines: 97 },
  },
  "ui-unit": {
    workspace: "packages/ui",
    include: [
      "src/components/button/button.tsx",
      "src/components/dialog/dialog.tsx",
      "src/lib/create-cropped-image.ts",
      "src/lib/utils.ts",
    ],
    exclude: coverageExcludes,
    thresholds: { statements: 91, branches: 83, functions: 87, lines: 90 },
  },
}

const webBrowserCoverageIncludes = [
  "src/components/**/*.{ts,tsx}",
  "src/features/**/components/**/*.{ts,tsx}",
  "src/features/**/hooks/**/*.{ts,tsx}",
  "src/hooks/**/*.{ts,tsx}",
]
const uiBrowserCoverageIncludes = [
  "src/components/**/*.{ts,tsx}",
  "src/hooks/**/*.{ts,tsx}",
  "src/lib/**/*.{ts,tsx}",
]
const browserCoverageProjects: Record<
  string,
  { workspace: string; include: string[] }
> = {
  "web-storybook-light": {
    workspace: "apps/web",
    include: webBrowserCoverageIncludes,
  },
  "web-storybook-dark": {
    workspace: "apps/web",
    include: webBrowserCoverageIncludes,
  },
  "web-browser": {
    workspace: "apps/web",
    include: webBrowserCoverageIncludes,
  },
  "ui-storybook-light": {
    workspace: "packages/ui",
    include: uiBrowserCoverageIncludes,
  },
  "ui-storybook-dark": {
    workspace: "packages/ui",
    include: uiBrowserCoverageIncludes,
  },
}

const prefixGlobs = (workspace: string, globs: string[]) =>
  globs.map((glob) => `${workspace}/${glob}`)

const coverageForSelectedProject = () => {
  const selectedProjects = process.argv.flatMap(
    (argument, index, arguments_) => {
      if (argument.startsWith("--project=")) {
        return [argument.slice("--project=".length)]
      }
      return argument === "--project" && arguments_[index + 1]
        ? [arguments_[index + 1]]
        : []
    }
  )
  const selectedProject =
    selectedProjects.length === 1 ? selectedProjects[0] : undefined
  const nodeCoverage = selectedProject
    ? nodeCoverageProjects[selectedProject]
    : undefined
  const browserCoverage = selectedProject
    ? browserCoverageProjects[selectedProject]
    : undefined

  if (!process.argv.includes("--coverage=false") && nodeCoverage) {
    return {
      enabled: true as const,
      provider: "v8" as const,
      reporter: ["text", "json-summary", "lcov", "html"] as const,
      reportsDirectory: `${nodeCoverage.workspace}/coverage/node`,
      include: prefixGlobs(nodeCoverage.workspace, nodeCoverage.include),
      ...(nodeCoverage.exclude
        ? { exclude: prefixGlobs(nodeCoverage.workspace, nodeCoverage.exclude) }
        : {}),
      thresholds: nodeCoverage.thresholds,
    }
  }

  if (process.env.BROWSER_COVERAGE === "1" && browserCoverage) {
    return {
      enabled: true as const,
      provider: "v8" as const,
      reporter: ["text", "json-summary", "lcov", "html"] as const,
      reportsDirectory: `${browserCoverage.workspace}/coverage/browser`,
      include: prefixGlobs(browserCoverage.workspace, browserCoverage.include),
      exclude: prefixGlobs(browserCoverage.workspace, coverageExcludes),
    }
  }

  return { enabled: false as const, provider: "v8" as const }
}

const webRequire = createRequire(path.join(webRoot, "package.json"))
const webStorybookAliases = {
  "next-themes": path.join(
    webRoot,
    "src/test-support/storybook/next-themes.tsx"
  ),
  "nuqs/adapters/next/app": path.join(
    webRoot,
    "src/test-support/storybook/nuqs-next-app.ts"
  ),
}
const webBrowserAliases = {
  ...webStorybookAliases,
  "next/link": webRequire.resolve("@storybook/nextjs-vite/link.mock"),
  "next/navigation": webRequire.resolve(
    "@storybook/nextjs-vite/navigation.mock"
  ),
}
const uiOptimizeDeps = [
  "@base-ui/react/alert-dialog",
  "@base-ui/react/drawer",
  "@base-ui/react/toggle",
  "@base-ui/react/toggle-group",
]

const storybookProject = ({
  name,
  projectRoot,
  theme,
  web,
}: {
  name: string
  projectRoot: string
  theme: "light" | "dark"
  web: boolean
}): TestProjectInlineConfiguration => ({
  root: projectRoot,
  ...(web ? {} : { optimizeDeps: { include: uiOptimizeDeps } }),
  plugins: [
    ...(web ? [react()] : []),
    storybookTest({
      configDir: path.join(projectRoot, ".storybook"),
      initialGlobals: { theme },
      ...(theme === "dark" ? { tags: { include: ["theme-sensitive"] } } : {}),
    }),
  ],
  ...(web
    ? {
        define: {
          __dirname: JSON.stringify("/"),
          "process.env": "{}",
        },
        resolve: {
          alias: {
            "@": path.join(webRoot, "src"),
            ...webStorybookAliases,
          },
        },
      }
    : {}),
  test: {
    name,
    fileParallelism: false,
    maxWorkers: 1,
    browser: {
      enabled: true,
      provider: playwright({}),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
})

export default defineConfig({
  root,
  test: {
    coverage: coverageForSelectedProject(),
    env: { NODE_ENV: "test" },
    forceRerunTriggers: [
      "**/package.json",
      "**/{vitest,vite}*.config.*",
      "**/vitest.setup.*",
      "**/vitest.browser.setup.*",
      "**/tsconfig.json",
      "**/drizzle/**",
      "**/src/schema/**",
      "**/drizzle.config.ts",
    ],
    projects: [
      {
        root,
        test: {
          name: "root-unit",
          include: [".github/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      "apps/*/vitest.config.ts",
      "packages/*/vitest.config.ts",
      storybookProject({
        name: "web-storybook-light",
        projectRoot: webRoot,
        theme: "light",
        web: true,
      }),
      storybookProject({
        name: "web-storybook-dark",
        projectRoot: webRoot,
        theme: "dark",
        web: true,
      }),
      {
        root: webRoot,
        plugins: [react()],
        optimizeDeps: {
          include: [
            "@storybook/nextjs-vite/link.mock",
            "@storybook/nextjs-vite/navigation.mock",
          ],
        },
        define: { "process.env": "{}" },
        resolve: {
          alias: {
            "@": path.join(webRoot, "src"),
            ...webBrowserAliases,
          },
        },
        test: {
          name: "web-browser",
          include: [
            "src/{components,features,hooks,lib}/**/*.browser.test.{ts,tsx}",
          ],
          setupFiles: [path.join(webRoot, "vitest.browser.setup.ts")],
          browser: {
            enabled: true,
            provider: playwright({}),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
      storybookProject({
        name: "ui-storybook-light",
        projectRoot: uiRoot,
        theme: "light",
        web: false,
      }),
      storybookProject({
        name: "ui-storybook-dark",
        projectRoot: uiRoot,
        theme: "dark",
        web: false,
      }),
    ],
  },
})
