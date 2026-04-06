import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export interface CodeFile {
  filename: string;
  content: string;
  language: string;
}

const MAX_FILES = 30;
const MAX_FILE_SIZE_BYTES = 200_000;
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo"]);

const LANGUAGE_MAP: Record<string, string> = {
  ".css": "css",
  ".html": "html",
  ".java": "java",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "jsx",
  ".md": "markdown",
  ".py": "python",
  ".sql": "sql",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".txt": "text",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function extname(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

function inferLanguage(fileName: string) {
  return LANGUAGE_MAP[extname(fileName)] || "text";
}

async function walk(dir: string, rootDir: string, acc: CodeFile[]) {
  if (acc.length >= MAX_FILES) {
    return;
  }

  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (acc.length >= MAX_FILES) {
      return;
    }

    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      await walk(fullPath, rootDir, acc);
      continue;
    }

    const fileStat = await stat(fullPath);
    if (fileStat.size > MAX_FILE_SIZE_BYTES) {
      continue;
    }

    const content = await readFile(fullPath, "utf8").catch(() => "");
    if (!content.trim()) {
      continue;
    }

    acc.push({
      filename: relative(rootDir, fullPath).replace(/\\/g, "/"),
      content,
      language: inferLanguage(entry.name),
    });
  }
}

export async function readCodeFiles(rootDir: string): Promise<CodeFile[]> {
  const files: CodeFile[] = [];
  await walk(rootDir, rootDir, files);

  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

export async function readSubmissionFiles(rootDir: string) {
  return readCodeFiles(rootDir);
}
