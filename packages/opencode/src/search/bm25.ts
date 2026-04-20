import fs from "fs/promises"
import path from "path"

export interface Document {
  filepath: string
  content: string
  terms: string[]
}

export interface SearchResult {
  document: Document
  score: number
  matches: string[]
}

export interface SearchOptions {
  limit?: number
}

export class BM25 {
  private documents: Document[] = []
  private docIndex: Map<string, Document> = new Map()
  private termDocs: Map<string, Set<number>> = new Map()
  private avgDocLength = 0
  private readonly k1 = 1.5
  private readonly b = 0.75

  get docCount(): number {
    return this.documents.length
  }

  async indexDirectory(dir: string, patterns: string[]): Promise<void> {
    this.documents = []
    this.docIndex.clear()
    this.termDocs.clear()

    const files = await this.getFiles(dir, patterns)
    let totalLength = 0

    for (const filepath of files) {
      const content = await fs.readFile(filepath, "utf-8")
      const terms = this.tokenize(content)
      const doc: Document = {
        filepath: path.relative(dir, filepath),
        content,
        terms,
      }
      this.documents.push(doc)
      this.docIndex.set(doc.filepath, doc)
      totalLength += terms.length

      for (const term of new Set(terms)) {
        if (!this.termDocs.has(term)) {
          this.termDocs.set(term, new Set())
        }
        this.termDocs.get(term)!.add(this.documents.length - 1)
      }
    }

    this.avgDocLength = totalLength / Math.max(this.documents.length, 1)
  }

  private async getFiles(dir: string, patterns: string[]): Promise<string[]> {
    const files: string[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== ".git" && !entry.name.startsWith(".")) {
          files.push(...(await this.getFiles(fullPath, patterns)))
        }
      } else if (entry.isFile()) {
        for (const pattern of patterns) {
          if (this.matchesPattern(entry.name, pattern)) {
            files.push(fullPath)
            break
          }
        }
      }
    }

    return files
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    const regex = this.patternToRegex(pattern)
    return regex.test(filename)
  }

  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
    return new RegExp(`^${escaped}$`, "i")
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1)
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const limit = options.limit ?? 100
    const queryTerms = this.tokenize(query)

    if (queryTerms.length === 0) {
      return []
    }

    const scores = new Map<number, number>()
    const matches = new Map<number, Set<string>>()

    for (const term of queryTerms) {
      const docIds = this.termDocs.get(term)
      if (!docIds) continue

      const df = docIds.size
      const idf = Math.log((this.documents.length - df + 0.5) / (df + 0.5) + 1)

      for (const docId of docIds) {
        const doc = this.documents[docId]
        const tf = doc.terms.filter((t) => t === term).length
        const docLength = doc.terms.length

        const score = idf * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / this.avgDocLength)))

        scores.set(docId, (scores.get(docId) ?? 0) + score)

        if (!matches.has(docId)) {
          matches.set(docId, new Set())
        }
        matches.get(docId)!.add(term)
      }
    }

    const results: SearchResult[] = []
    for (const [docId, score] of scores) {
      results.push({
        document: this.documents[docId],
        score,
        matches: [...matches.get(docId)!],
      })
    }

    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit)
  }
}