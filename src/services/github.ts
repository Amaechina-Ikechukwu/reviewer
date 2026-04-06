import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

export async function cloneGithubRepo(url: string, destDir: string): Promise<void> {
  if (!/^https?:\/\/(www\.)?github\.com\/.+/.test(url.trim())) {
    throw new Error("Please provide a valid public GitHub repository URL.");
  }

  const cleanUrl = url.trim().endsWith(".git") ? url.trim() : `${url.trim()}.git`;

  await mkdir(dirname(destDir), { recursive: true });
  await runCommand("git", ["clone", "--depth", "1", cleanUrl, destDir]);
}
