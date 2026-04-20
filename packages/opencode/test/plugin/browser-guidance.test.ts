import { describe, test, expect } from "bun:test"
import { Plugin } from "../../src/plugin"

describe("browser plugin", () => {
  test("verify: browser plugin exports exist", () => {
    expect(typeof Plugin).toBe("object")
  })
})

describe("search plugin", () => {
  test("verify: search plugin exports exist", () => {
    expect(typeof Plugin).toBe("object")
  })
})