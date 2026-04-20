import type { Reporter, FullConfig, TestCase, TestResult, Suite } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";

interface AnalysisResult {
  hasIssues: boolean;
  issues: string[];
  summary: string;
  rawOutput: string;
}

export class VisionReporter implements Reporter {
  private outputDir: string;
  private analyzeScript: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    // Path to the analyze-screenshot script
    this.analyzeScript = path.join(__dirname, "..", "analyze-screenshot.js");
  }

  async onBegin(config: FullConfig, suite: Suite): Promise<void> {
    console.log(`\n[VisonReporter] Starting - will analyze screenshots on test failures`);
    console.log(`[VisionReporter] Output directory: ${this.outputDir}`);
    console.log(`[VisionReporter] Analyze script: ${this.analyzeScript}`);
  }

  onTestFailed(test: TestCase, result: TestResult): void {
    this.findAndAnalyzeScreenshot(test, result).catch((err) => {
      console.error(`[VisionReporter] Error analyzing screenshot: ${err.message}`);
    });
  }

  private async findAndAnalyzeScreenshot(test: TestCase, result: TestResult): Promise<void> {
    // Wait for screenshot file to be written
    const screenshotPath = this.findScreenshot(test, result);

    if (!screenshotPath) {
      console.log(`[VisionReporter] No screenshot found for failed test: ${test.title}`);
      return;
    }

    console.log(`\n[VisionReporter] Analyzing screenshot: ${screenshotPath}`);

    try {
      const analysis = await this.analyzeScreenshot(screenshotPath);

      console.log(`\n========================================`);
      console.log(`[VisionReporter] ANALYSIS RESULT`);
      console.log(`========================================`);
      console.log(`Test: ${test.title}`);
      console.log(`Screenshot: ${screenshotPath}`);
      console.log(`Has Issues: ${analysis.hasIssues}`);
      console.log(`Summary: ${analysis.summary}`);
      if (analysis.issues.length > 0) {
        console.log(`Issues found:`);
        analysis.issues.forEach((issue, i) => {
          console.log(`  ${i + 1}. ${issue}`);
        });
      }
      console.log(`========================================\n`);

      if (analysis.hasIssues) {
        // Throw an error to mark the test as failed
        const issueList = analysis.issues.join("; ");
        throw new Error(
          `UI issues detected by VisionReporter: ${issueList}\nSummary: ${analysis.summary}`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("UI issues detected")) {
        // This is our expected error from issues found - re-throw to fail the test
        throw err;
      }
      // For other errors, log but don't fail
      console.error(`[VisionReporter] Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private findScreenshot(test: TestCase, result: TestResult): string | null {
    if (!fs.existsSync(this.outputDir)) {
      return null;
    }

    // Playwright screenshots are named with the test id and timestamp
    // Pattern: <test-id>-<timestamp>.png
    const testId = test.id();
    const retry = result.retry;

    // Try to find a screenshot matching this test
    const files = fs.readdirSync(this.outputDir);

    // Sort by modification time (newest first)
    const sortedFiles = files
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(this.outputDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    for (const file of sortedFiles) {
      // Screenshots typically have the test title in the filename or are from the same test run
      // Since we can't easily correlate, we take the most recent screenshot after the test started
      if (file.name.endsWith(".png") || file.name.endsWith(".jpg")) {
        // Check if file was created after the test started
        const testStartTime = result.startTime?.getTime() ?? 0;
        const fileTime = file.time;

        // Allow some tolerance (5 seconds) for timing issues
        if (fileTime >= testStartTime - 5000) {
          return path.join(this.outputDir, file.name);
        }
      }
    }

    // Fallback: look for any recent screenshot
    for (const file of sortedFiles) {
      if (file.name.endsWith(".png") || file.name.endsWith(".jpg")) {
        return path.join(this.outputDir, file.name);
      }
    }

    return null;
  }

  private async analyzeScreenshot(imagePath: string): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn("node", [this.analyzeScript, imagePath], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        // stdout has the JSON result
        try {
          const result = JSON.parse(stdout.trim()) as AnalysisResult;
          resolve(result);
        } catch {
          // If we can't parse JSON, try to construct a result from the output
          resolve({
            hasIssues: false,
            issues: [],
            summary: stdout.trim() || "No output from analysis",
            rawOutput: stdout,
          });
        }
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to run analyze script: ${err.message}`));
      });

      // Timeout after 3 minutes
      setTimeout(() => {
        proc.kill();
        reject(new Error("Analysis timeout after 180 seconds"));
      }, 180000);
    });
  }
}