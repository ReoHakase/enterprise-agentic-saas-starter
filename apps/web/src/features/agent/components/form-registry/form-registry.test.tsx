import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { describe, expect, it, vi } from "vitest"

import {
  AgentFormRegistryProvider,
  useAgentFormRegistry,
  type AgentFormAdapter,
} from "./form-registry"

const RegistryHarness = ({
  apply,
}: {
  apply: (patch: { title?: string; description?: string }) => void
}) => {
  const registry = useAgentFormRegistry()
  const [result, setResult] = useState("")
  const titleRef = useRef("Human draft")
  const adapter = useMemo<AgentFormAdapter>(
    () => ({
      formId: "issue:issue-1",
      organizationId: "org-1",
      resource: "issue",
      resourceId: "issue-1",
      revision: 4,
      epoch: "epoch-1",
      read: () => ({
        values: { title: titleRef.current },
        dirtyFields: ["title"],
      }),
      validate: (patch) => ({ success: true, patch }),
      apply: (patch) => {
        titleRef.current = patch.title ?? titleRef.current
        apply(patch)
      },
    }),
    [apply]
  )
  useEffect(() => registry.register(adapter), [adapter, registry])
  const patch = useCallback(() => {
    void registry
      .patch(
        {
          organizationId: adapter.organizationId,
          formId: adapter.formId,
          expectedEpoch: adapter.epoch,
          expectedRevision: adapter.revision,
        },
        { title: "Agent title" }
      )
      .then(() => setResult("applied"))
      .catch(() => setResult("kept"))
  }, [adapter, registry])
  const freeze = useCallback(() => registry.setFrozen(true), [registry])
  const patchWithoutRevision = useCallback(() => {
    void registry
      .patch(
        // @ts-expect-error -- This runtime-boundary test intentionally bypasses the required revision.
        {
          organizationId: adapter.organizationId,
          formId: adapter.formId,
          expectedEpoch: adapter.epoch,
        },
        { title: "Unfenced title" }
      )
      .then(() => setResult("unsafe-applied"))
      .catch(() => setResult("revision-required"))
  }, [adapter, registry])

  return (
    <div>
      <button type="button" onClick={patch}>
        Patch
      </button>
      <button type="button" onClick={freeze}>
        Freeze
      </button>
      <button type="button" onClick={patchWithoutRevision}>
        Patch without revision
      </button>
      <output>{result}</output>
    </div>
  )
}

const AmbiguousRegistryHarness = () => {
  const registry = useAgentFormRegistry()
  const [result, setResult] = useState("")
  useEffect(() => {
    const adapters = ["issue:1", "issue:2"].map<AgentFormAdapter>((formId) => ({
      formId,
      organizationId: "org-1",
      resource: "issue",
      revision: 1,
      epoch: `epoch:${formId}`,
      read: () => ({ values: {}, dirtyFields: [] }),
      validate: (patch) => ({ success: true, patch }),
      apply: () => undefined,
    }))
    const unregister = adapters.map(registry.register)
    return () => unregister.forEach((remove) => remove())
  }, [registry])
  const read = useCallback(() => {
    try {
      registry.read({ organizationId: "org-1" })
      setResult("read")
    } catch {
      setResult("ambiguous")
    }
  }, [registry])

  return (
    <button type="button" onClick={read}>
      {result || "Read"}
    </button>
  )
}

describe("Agent form registry", () => {
  it("requires explicit confirmation before replacing a dirty Issue field", async () => {
    const actor = userEvent.setup()
    const apply =
      vi.fn<(patch: { title?: string; description?: string }) => void>()
    render(
      <AgentFormRegistryProvider>
        <RegistryHarness apply={apply} />
      </AgentFormRegistryProvider>
    )

    await actor.click(screen.getByRole("button", { name: "Patch" }))
    expect(
      screen.getByRole("heading", { name: "Replace your unsaved field?" })
    ).toBeInTheDocument()
    await actor.click(screen.getByRole("button", { name: "Keep my draft" }))
    expect(await screen.findByText("kept")).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()

    await actor.click(screen.getByRole("button", { name: "Patch" }))
    await actor.click(screen.getByRole("button", { name: "Apply agent patch" }))
    expect(await screen.findByText("applied")).toBeInTheDocument()
    expect(apply).toHaveBeenCalledWith({ title: "Agent title" })
  })

  it("rejects a pending patch when organization switching freezes forms", async () => {
    const actor = userEvent.setup()
    const apply =
      vi.fn<(patch: { title?: string; description?: string }) => void>()
    render(
      <AgentFormRegistryProvider>
        <RegistryHarness apply={apply} />
      </AgentFormRegistryProvider>
    )

    await actor.click(screen.getByRole("button", { name: "Patch" }))
    await actor.click(screen.getByText("Freeze"))

    expect(await screen.findByText("kept")).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Replace your unsaved field?" })
    ).not.toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it("rejects a patch that bypasses the client schema without a revision", async () => {
    const actor = userEvent.setup()
    const apply =
      vi.fn<(patch: { title?: string; description?: string }) => void>()
    render(
      <AgentFormRegistryProvider>
        <RegistryHarness apply={apply} />
      </AgentFormRegistryProvider>
    )

    await actor.click(
      screen.getByRole("button", { name: "Patch without revision" })
    )
    expect(await screen.findByText("revision-required")).toBeInTheDocument()
    expect(apply).not.toHaveBeenCalled()
  })

  it("rejects an implicit target when multiple Issue forms are mounted", async () => {
    const actor = userEvent.setup()
    render(
      <AgentFormRegistryProvider>
        <AmbiguousRegistryHarness />
      </AgentFormRegistryProvider>
    )

    await actor.click(screen.getByRole("button", { name: "Read" }))
    expect(
      screen.getByRole("button", { name: "ambiguous" })
    ).toBeInTheDocument()
  })
})
