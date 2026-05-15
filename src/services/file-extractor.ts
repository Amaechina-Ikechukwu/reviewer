import extract from "extract-zip";
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function flattenSingleRootFolder(destDir: string) {
  const entries = (await readdir(destDir)).filter((entry) => !entry.startsWith("."));

  if (entries.length !== 1) {
    return;
  }

  const innerPath = join(destDir, entries[0]);
  const innerStat = await stat(innerPath).catch(() => null);
  if (!innerStat?.isDirectory()) {
    return;
  }

  const innerEntries = await readdir(innerPath);

  for (const entry of innerEntries) {
    await rename(join(innerPath, entry), join(destDir, entry));
  }

  await rm(innerPath, { recursive: true, force: true });
}

export async function savePdf(file: File, destDir: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return savePdfBuffer(buffer, file.name, destDir);
}

export async function savePdfBuffer(buffer: Buffer, filename: string, destDir: string): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dest = join(destDir, safeName);
  await writeFile(dest, buffer);
  return dest;
}

export async function extractZip(file: File, destDir: string): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip or .pdf uploads are supported.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await extractZipBuffer(buffer, destDir);
}

export async function extractZipBuffer(buffer: Buffer, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const tempPath = join(destDir, "__upload.zip");
  await writeFile(tempPath, buffer);
  try {
    await extract(tempPath, { dir: destDir });
    await flattenSingleRootFolder(destDir);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
