import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Instance } from "../../src/project/instance"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { ToolRegistry } from "../../src/tool/registry"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer
const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, node))

describe("websearch baseline", () => {
  it.live("baseline: websearch tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()

        const websearchTools = ids.filter((id) => id === "websearch" || id.includes("websearch"))
        console.log(`[BASELINE] Websearch tools: ${websearchTools.join(", ")}`)

        expect(websearchTools.length).toBeGreaterThan(0)
        expect(websearchTools).toContain("websearch")
      }),
    ),
  )

  it.live("baseline: websearch is accessible via MCP tools", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const all = yield* registry.all()

        const websearchTool = all.find((t) => t.id === "websearch")
        expect(websearchTool).toBeDefined()
        expect(websearchTool?.description).toContain("search")
      }),
    ),
  )
})