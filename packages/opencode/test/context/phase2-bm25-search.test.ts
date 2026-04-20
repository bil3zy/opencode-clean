import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { BM25 } from "../../src/search/bm25"
import path from "path"

describe("search.bm25 (Phase 2)", () => {
  describe("basic indexing", () => {
    test("indexes documents from directory", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "file1.ts"), "export function hello() { return 'world'; }")
      await Bun.write(path.join(tmp.path, "file2.ts"), "export const foo = 'bar';")
      await Bun.write(path.join(tmp.path, "file3.ts"), "import { hello } from './file1';")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      expect(index.docCount).toBe(3)
    })

    test("handles empty directory", async () => {
      await using tmp = await tmpdir()
      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      expect(index.docCount).toBe(0)
    })
  })

  describe("search scoring", () => {
    test("ranks exact matches higher", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "exact.ts"), "ERR_001: Error code exact match here")
      await Bun.write(path.join(tmp.path, "related.ts"), "Error handling with different codes")
      await Bun.write(path.join(tmp.path, "other.ts"), "Some other content")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("ERR_001")
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].document.filepath).toContain("exact.ts")
    })

    test("ranks term frequency appropriately", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "freq.ts"), "function test() { test(); test(); test(); }")
      await Bun.write(path.join(tmp.path, "once.ts"), "function test() { return 1; }")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("test")
      expect(results.length).toBe(2)
      expect(results[0].document.filepath).toContain("freq.ts")
    })

    test("handles multiple term queries", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "match.ts"), "export async function handleRequest(req, res) { return res; }")
      await Bun.write(path.join(tmp.path, "nomatch.ts"), "export function processData(data) { return data; }")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("handleRequest")
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].document.filepath).toContain("match.ts")
    })
  })

  describe("search results", () => {
    test("returns results with scores", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "test.ts"), "export const value = 42;")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("value")
      expect(results.length).toBe(1)
      expect(results[0].score).toBeGreaterThan(0)
    })

    test("returns empty for no matches", async () => {
      await using tmp = await tmpdir()
      await Bun.write(path.join(tmp.path, "test.ts"), "export const value = 42;")

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("nonexistent_term_xyz")
      expect(results.length).toBe(0)
    })

    test("respects limit parameter", async () => {
      await using tmp = await tmpdir()
      for (let i = 0; i < 10; i++) {
        await Bun.write(path.join(tmp.path, `file${i}.ts`), `export const item${i} = ${i};`)
      }

      const index = new BM25()
      await index.indexDirectory(tmp.path, ["*.ts"])

      const results = await index.search("export", { limit: 3 })
      expect(results.length).toBe(3)
    })
  })
})