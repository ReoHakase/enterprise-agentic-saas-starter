import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  localWorkerConfigPaths,
  resolveDevelopmentAgentAssetUploadFlag,
  resolveWranglerInspectorPort,
} from "./local-worker"

describe("local Workerのdevelopment設定", () => {
  it("1つのWrangler sessionでAPIとprivate Images Workerを起動する", () => {
    expect(localWorkerConfigPaths).toEqual([
      "wrangler.jsonc",
      "../images/wrangler.jsonc",
    ])
  })

  it("Mailpitを注入するためAPI supervisorをdev経路に保つ", async () => {
    const packageJson: unknown = JSON.parse(
      await readFile(resolve(import.meta.dirname, "../../package.json"), "utf8")
    )
    if (typeof packageJson !== "object" || packageJson === null) {
      throw new TypeError("apps/api/package.json must contain an object")
    }
    const scripts = Reflect.get(packageJson, "scripts")
    if (typeof scripts !== "object" || scripts === null) {
      throw new TypeError("apps/api/package.json scripts must be an object")
    }

    expect(Reflect.get(scripts, "dev")).toContain(
      "portless-topology run api.enterprise-agentic-saas -- bun run src/dev.ts"
    )
  })

  it("MCP Inspectorを保護済みPortless browser originへbindingする", async () => {
    const packageJson: unknown = JSON.parse(
      await readFile(resolve(import.meta.dirname, "../../package.json"), "utf8")
    )
    if (typeof packageJson !== "object" || packageJson === null) {
      throw new TypeError("apps/api/package.json must contain an object")
    }
    const scripts = Reflect.get(packageJson, "scripts")
    if (typeof scripts !== "object" || scripts === null) {
      throw new TypeError("apps/api/package.json scripts must be an object")
    }
    const inspectorScript = Reflect.get(scripts, "dev:inspector")

    expect(inspectorScript).toBeTypeOf("string")
    expect(inspectorScript).toContain(
      "portless-topology run mcp-inspector.enterprise-agentic-saas"
    )
    expect(inspectorScript).toContain('CLIENT_PORT="$PORT"')
    expect(inspectorScript).toContain('ALLOWED_ORIGINS="$PORTLESS_URL"')
    expect(inspectorScript).toContain("MCP_AUTO_OPEN_ENABLED=false")
    expect(inspectorScript).toContain('--server-url "$API_PUBLIC_URL/mcp"')
    expect(inspectorScript).toContain("--transport http")
    expect(inspectorScript).toContain("> /dev/null")
    expect(inspectorScript).not.toContain("DANGEROUSLY_OMIT_AUTH")

    const rootPackageJson: unknown = JSON.parse(
      await readFile(
        resolve(import.meta.dirname, "../../../../package.json"),
        "utf8"
      )
    )
    if (typeof rootPackageJson !== "object" || rootPackageJson === null) {
      throw new TypeError("root package.json must contain an object")
    }
    const rootScripts = Reflect.get(rootPackageJson, "scripts")
    if (typeof rootScripts !== "object" || rootScripts === null) {
      throw new TypeError("root package.json scripts must be an object")
    }
    expect(Reflect.get(rootScripts, "dev:mcp-inspector")).toContain(
      "portless-topology exec -- turbo run dev:inspector"
    )
  })

  it("明示指定がなければOSにInspector portを割り当てさせる", () => {
    expect(resolveWranglerInspectorPort({})).toBe("0")
    expect(
      resolveWranglerInspectorPort({ WRANGLER_INSPECTOR_PORT: "9234" })
    ).toBe("9234")
  })

  it("local supervisorだけでAgent画像uploadを既定有効にする", () => {
    expect(resolveDevelopmentAgentAssetUploadFlag({})).toBe("1")
    expect(
      resolveDevelopmentAgentAssetUploadFlag({
        AGENT_ASSET_UPLOAD_ENABLED: " 0 ",
      })
    ).toBe("0")
  })

  it.each([
    { label: "負数のInspector port", value: "-1" },
    { label: "小数のInspector port", value: "1.5" },
    { label: "数値でないInspector port", value: "invalid" },
    { label: "上限を超えるInspector port", value: "65536" },
  ])("$labelを拒否する", ({ value }) => {
    expect(() =>
      resolveWranglerInspectorPort({ WRANGLER_INSPECTOR_PORT: value })
    ).toThrow("WRANGLER_INSPECTOR_PORT must be an integer from 0 to 65535")
  })
})
