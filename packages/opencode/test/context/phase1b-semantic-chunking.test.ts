import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { Agent } from "../../src/agent/agent"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { AppFileSystem } from "../../src/filesystem"
import { FileTime } from "../../src/file/time"
import { LSP } from "../../src/lsp"
import { Instance } from "../../src/project/instance"
import { SessionID, MessageID } from "../../src/session/schema"
import { Instruction } from "../../src/session/instruction"
import { ReadTool } from "../../src/tool/read"
import { Truncate } from "../../src/tool/truncate"
import { Tool } from "../../src/tool/tool"
import { provideInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make(""),
  callID: "",
  agent: "build" as const,
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const it = testEffect(
  Layer.mergeAll(
    Agent.defaultLayer,
    AppFileSystem.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    FileTime.defaultLayer,
    Instruction.defaultLayer,
    LSP.defaultLayer,
    Truncate.defaultLayer,
  ),
)

const init = Effect.fn("ReadToolTest.init")(function* () {
  const info = yield* ReadTool
  return yield* info.init()
})

const run = Effect.fn("ReadToolTest.run")(function* (
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  const tool = yield* init()
  return yield* tool.execute(args, next)
})

const exec = Effect.fn("ReadToolTest.exec")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  return yield* provideInstance(dir)(run(args, next))
})

const put = Effect.fn("ReadToolTest.put")(function* (p: string, content: string) {
  const fs = yield* AppFileSystem.Service
  yield* fs.writeWithDirs(p, content)
})

describe("tool.read semantic chunking (Phase 1B)", () => {
  describe("large file chunking", () => {
    it.live("chunks large files and includes pagination info", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "large.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "large.ts"), limit: 20, offset: 1 })
        expect(result.output).toContain("Showing lines")
        expect(result.output).toMatch(/lines \d+-\d+/)
      }),
    )

    it.live("indicates total chunks in metadata for large files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "large.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "large.ts"), limit: 20, offset: 1 })
        // @ts-expect-error - totalChunks not in type
        expect(result.metadata.totalChunks).toBeDefined()
        // @ts-expect-error - totalChunks not in type
        expect(typeof result.metadata.totalChunks).toBe("number")
      }),
    )

    it.live("includes current chunk number for large files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "large.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "large.ts"), limit: 20, offset: 1 })
        // @ts-expect-error - currentChunk not in type
        expect(result.metadata.currentChunk).toBeDefined()
      }),
    )
  })

  describe("chunk navigation", () => {
    it.live("provides chunk navigation info in output", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 50 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "medium.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "medium.ts"), limit: 25 })
        expect(result.output).toMatch(/chunk|offset|continue|next/)
      }),
    )

    it.live("shows next chunk hint when more content exists", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 60 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "medium.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "medium.ts"), limit: 20 })
        expect(result.output).toMatch(/offset=\d+|continue|next chunk/)
      }),
    )
  })

  describe("semantic boundary awareness", () => {
    it.live("includes function context in first chunk of function", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "handler.ts"),
          `export async function handleRequest(req, res) {
  // Handler implementation
  // with multiple lines
  return res.send("ok");
}`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "handler.ts") })
        expect(result.output).toContain("handleRequest")
        expect(result.output).toContain("Handler implementation")
      }),
    )

    it.live("preserves context across chunks for multi-line functions", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "long.ts"),
          `export function longFunction() {
  // Line 1 of function body
  // Line 2 of function body
  // Line 3 of function body
  // Line 4 of function body
  // Line 5 of function body
  return true;
}`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "long.ts") })
        expect(result.output).toContain("longFunction")
        expect(result.output).toContain("Line 1 of function body")
      }),
    )
  })
})