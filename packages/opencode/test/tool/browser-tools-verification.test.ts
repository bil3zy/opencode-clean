import { describe, test, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Instance } from "../../src/project/instance"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { ToolRegistry } from "../../src/tool/registry"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer
const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, node))

describe("browser tools verification", () => {
  it.live("verify: browser_navigate tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        
        console.log(`[VERIFY] All tool IDs: ${ids.join(", ")}`)
        
        const browserTools = ids.filter((id) => id.startsWith("browser_"))
        console.log(`[VERIFY] Browser tools found: ${browserTools.join(", ")}`)
        
        expect(browserTools.length).toBeGreaterThan(0)
        expect(browserTools).toContain("browser_navigate")
        expect(browserTools).toContain("browser_click")
        expect(browserTools).toContain("browser_type")
        expect(browserTools).toContain("browser_snapshot")
        expect(browserTools).toContain("browser_screenshot")
        expect(browserTools).toContain("browser_wait")
      }),
    ),
  )

  it.live("verify: searxng_search tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        
        const searxngTools = ids.filter((id) => id.includes("searxng"))
        console.log(`[VERIFY] SearXNG tools found: ${searxngTools.join(", ")}`)
        
        expect(searxngTools.length).toBeGreaterThan(0)
        expect(searxngTools).toContain("searxng_search")
      }),
    ),
  )

  it.live("verify: research_websearch tool exists", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        
        const researchTools = ids.filter((id) => id.includes("research"))
        console.log(`[VERIFY] Research tools found: ${researchTools.join(", ")}`)
        
        expect(researchTools.length).toBeGreaterThan(0)
        expect(researchTools).toContain("research_websearch")
      }),
    ),
  )
})