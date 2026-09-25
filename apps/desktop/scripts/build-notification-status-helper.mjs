import { execFile } from "node:child_process";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const outputDir = path.join(desktopDir, "build", "native");
const helpers = [
  {
    sourcePath: path.join(desktopDir, "resources", "notification-status-helper.swift"),
    outputPath: path.join(outputDir, "pi-gui-notification-status-helper"),
  },
];

if (process.platform !== "darwin") {
  console.log("Skipping notification status helper build outside macOS.");
  process.exit(0);
}

await mkdir(outputDir, { recursive: true });
for (const helper of helpers) {
  await execFileAsync("xcrun", ["swiftc", helper.sourcePath, "-O", "-o", helper.outputPath], {
    cwd: desktopDir,
  });
  console.log(`Built native helper at ${helper.outputPath}`);
}

// Routey's Laya router helper is a SwiftPM package (it depends on FluidUse).
// It is optional at runtime: without it the router falls back to heuristics,
// so a failed build warns instead of failing the whole desktop build.
const layaPackageDir = path.join(desktopDir, "native", "laya-helper");
try {
  await execFileAsync("swift", ["build", "-c", "release", "--package-path", layaPackageDir], {
    cwd: desktopDir,
    maxBuffer: 64 * 1024 * 1024,
  });
  const { stdout } = await execFileAsync(
    "swift",
    ["build", "-c", "release", "--package-path", layaPackageDir, "--show-bin-path"],
    { cwd: desktopDir },
  );
  const layaOutputPath = path.join(outputDir, "routey-laya-helper");
  // Replace, never overwrite: macOS caches a binary's code signature per inode,
  // and a changed file under the same inode is killed (SIGKILL) at launch.
  await rm(layaOutputPath, { force: true });
  await copyFile(path.join(stdout.trim(), "routey-laya-helper"), layaOutputPath);
  console.log(`Built native helper at ${layaOutputPath}`);
} catch (error) {
  console.warn(
    `Skipping the Laya router helper; routing will use heuristics. ${
      error instanceof Error ? error.message.split("\n")[0] : String(error)
    }`,
  );
}
