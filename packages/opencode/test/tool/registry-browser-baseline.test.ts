import { describe, test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Effect, Layer } from "effect"
import { Instance } from "../../src/project/instance"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { ToolRegistry } from "../../src/tool/registry"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer
const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, node))

describe("tool.registry baseline", () => {
  it.live("baseline: current tool count", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()

        console.log(`[BASELINE] Total tool count: ${ids.length}`)
        console.log(`[BASELINE] Tool IDs: ${ids.slice(0, 20).join(", ")}${ids.length > 20 ? "..." : ""}`)

        expect(ids.length).toBeGreaterThan(20)
      }),
    ),
  )

  it.live("baseline: no browser_* tools exist", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        const browserTools = ids.filter((id) => id.startsWith("browser_"))

        console.log(`[BASELINE] Browser tools count: ${browserTools.length}`)
        expect(browserTools.length).toBe(0)
      }),
    ),
  )

  it.live("baseline: no searxng tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        const searxngTools = ids.filter((id) => id.includes("searxng"))

        console.log(`[BASELINE] SearXNG tools count: ${searxngTools.length}`)
        expect(searxngTools.length).toBe(0)
      }),
    ),
  )

  it.live("baseline: no research_websearch tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        const researchTools = ids.filter((id) => id.includes("research"))

        console.log(`[BASELINE] Research tools count: ${researchTools.length}`)
        console.log(`[BASELINE] Research tools: ${researchTools.join(", ")}`)
        expect(researchTools.length).toBe(0)
      }),
    ),
  )
})