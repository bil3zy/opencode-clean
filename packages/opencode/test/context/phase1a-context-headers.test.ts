import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { Agent } from "../../src/agent/agent"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { AppFileSystem } from "../../src/filesystem"
import { FileTime } from "../../src/file/time"
import { LSP } from "../../src/lsp"
import { Permission } from "../../src/permission"
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

const put = Effect.fn("ReadToolTest.put")(function* (p: string, content: string | Buffer | Uint8Array) {
  const fs = yield* AppFileSystem.Service
  yield* fs.writeWithDirs(p, content)
})

describe("tool.read contextual headers (Phase 1A)", () => {
  describe("file_context basic structure", () => {
    it.live("includes <file_context> tag in output for source files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "test.ts"),
          `export const foo = "bar";
export function test() { return foo; }`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "test.ts") })
        expect(result.output).toContain("<file_context>")
        expect(result.output).toContain("</file_context>")
      }),
    )

    it.live("includes Module: line with relative path", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(path.join(dir, "handlers.ts"), `export const handler = () => {}`)

        const result = yield* exec(dir, { filePath: path.join(dir, "handlers.ts") })
        expect(result.output).toContain("Module:")
        expect(result.output).toContain("handlers.ts")
      }),
    )

    it.live("includes Exports: line for files with exports", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "utils.ts"),
          `export const helper = 1;
export function process() { return helper; }
export class Helper {}`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "utils.ts") })
        expect(result.output).toContain("Exports:")
        expect(result.output).toContain("helper")
        expect(result.output).toContain("process")
        expect(result.output).toContain("Helper")
      }),
    )

    it.live("includes Imports: line for files with imports", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "handler.ts"),
          `import { helper } from "./utils";
import { User } from "../types/user";
import * as crypto from "crypto";
export const handler = () => helper();`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "handler.ts") })
        expect(result.output).toContain("Imports:")
        expect(result.output).toContain("./utils")
        expect(result.output).toContain("../types/user")
        expect(result.output).toContain("crypto")
      }),
    )

    it.live("shows 'none' for imports/exports when file has none", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(path.join(dir, "data.ts"), `const foo = "bar";`)

        const result = yield* exec(dir, { filePath: path.join(dir, "data.ts") })
        expect(result.output).toContain("Imports: none")
        expect(result.output).toContain("Exports: none")
      }),
    )

    it.live("includes Related: line with detected related files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(path.join(dir, "index.ts"), `export { handler } from "./handler";`)
        yield* put(path.join(dir, "handler.ts"), `import { validate } from "./validator";
export const handler = () => validate();`)
        yield* put(path.join(dir, "validator.ts"), `export const validate = () => true;`)

        const result = yield* exec(dir, { filePath: path.join(dir, "handler.ts") })
        expect(result.output).toContain("Related:")
        expect(result.output).toMatch(/validator\.ts|index\.ts/)
      }),
    )

    it.live("does not include <file_context> for non-code files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(path.join(dir, "readme.md"), "# README\nThis is a readme file.")

        const result = yield* exec(dir, { filePath: path.join(dir, "readme.md") })
        expect(result.output).not.toContain("<file_context>")
      }),
    )
  })

  describe("file_context with project structure", () => {
    it.live("shows module path for nested source files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "src/auth/handlers.ts"),
          `export const login = () => {}`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "src/auth/handlers.ts") })
        expect(result.output).toContain("Module:")
        expect(result.output).toContain("src/auth/handlers.ts")
      }),
    )

    it.live("includes parent module context for nested files", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        yield* put(
          path.join(dir, "src/api/v1/users.ts"),
          `export const getUsers = () => []`,
        )

        const result = yield* exec(dir, { filePath: path.join(dir, "src/api/v1/users.ts") })
        expect(result.output).toContain("src/api/v1/users.ts")
      }),
    )
  })

  describe("file_context with chunked reads", () => {
    it.live("includes context header when reading with offset", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = ["export const a = 1;", "export const b = 2;", "export const c = 3;"]
        yield* put(path.join(dir, "multi.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "multi.ts"), offset: 2 })
        expect(result.output).toContain("<file_context>")
        expect(result.output).toContain("multi.ts")
      }),
    )

    it.live("includes context when reading with limit", () =>
      Effect.gen(function* () {
        const dir = yield* tmpdirScoped()
        const lines = Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i};`)
        yield* put(path.join(dir, "large.ts"), lines.join("\n"))

        const result = yield* exec(dir, { filePath: path.join(dir, "large.ts"), limit: 10 })
        expect(result.output).toContain("<file_context>")
        expect(result.output).toContain("Exports:")
      }),
    )
  })
})