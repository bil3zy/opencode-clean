const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

class VisionReporter {
  constructor(options) {
    this.outputDir = options?.outputDir || "./e2e/test-results";
  }

  onBegin(config, suite) {
    console.log(`\n[VisionReporter] Starting - will analyze screenshots on test failures`);
    console.log(`[VisionReporter] Output directory: ${this.outputDir}`);
  }

  onTestFailed(test, result) {
    this.findAndAnalyzeScreenshot(test, result).catch((err) => {
      console.error(`[VisionReporter] Error analyzing screenshot: ${err.message}`);
    });
  }

  async findAndAnalyzeScreenshot(test, result) {
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
        const issueList = analysis.issues.join("; ");
        throw new Error(
          `UI issues detected by VisionReporter: ${issueList}\nSummary: ${analysis.summary}`
        );
      }
    } catch (err) {
      if (err.message.includes("UI issues detected")) {
        throw err;
      }
      console.error(`[VisionReporter] Analysis failed: ${err.message}`);
    }
  }

  findScreenshot(test, result) {
    if (!fs.existsSync(this.outputDir)) {
      return null;
    }

    const files = fs.readdirSync(this.outputDir);
    const sortedFiles = files
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(this.outputDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    for (const file of sortedFiles) {
      if (file.name.endsWith(".png") || file.name.endsWith(".jpg")) {
        const testStartTime = result.startTime?.getTime() ?? 0;
        const fileTime = file.time;

        if (fileTime >= testStartTime - 5000) {
          return path.join(this.outputDir, file.name);
        }
      }
    }

    // Fallback: most recent screenshot
    for (const file of sortedFiles) {
      if (file.name.endsWith(".png") || file.name.endsWith(".jpg")) {
        return path.join(this.outputDir, file.name);
      }
    }

    return null;
  }

  async analyzeScreenshot(imagePath) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, "..", "analyze-screenshot.ts");
      const proc = spawn("bun", [scriptPath, imagePath], {
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
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch {
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

      setTimeout(() => {
        proc.kill();
        reject(new Error("Analysis timeout after 180 seconds"));
      }, 180000);
    });
  }
}

module.exports = VisionReporter;