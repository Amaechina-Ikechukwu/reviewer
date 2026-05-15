/**
 * Zero-dependency structured logger.
 * - Production (NODE_ENV=production): one JSON object per line — Cloud Logging
 *   auto-parses `severity`, `message`, and arbitrary fields into jsonPayload.*.
 * - Dev: human-readable single line.
 * - ERROR/WARN go to stderr; INFO/DEBUG go to stdout.
 *   Cloud Run flags stderr as ERROR severity automatically.
 *
 * We intentionally do NOT use winston — it depends on Node streams in ways
 * that are unreliable under Bun, and Cloud Logging just needs JSON on stdout.
 */

type Level = "debug" | "info" | "warn" | "error";

const isProduction = process.env.NODE_ENV === "production";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as Level) || (isProduction ? "info" : "debug")] ?? LEVELS.info;

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;

  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;

  if (isProduction) {
    const payload = {
      severity: level.toUpperCase(),
      time: new Date().toISOString(),
      message,
      ...(meta || {}),
    };
    try {
      stream.write(JSON.stringify(payload) + "\n");
    } catch {
      // Last-ditch fallback if something in meta isn't JSON-serializable.
      stream.write(JSON.stringify({ severity: level.toUpperCase(), time: payload.time, message, metaError: "unserializable" }) + "\n");
    }
    return;
  }

  const metaStr = meta && Object.keys(meta).length ? ` ${safeStringify(meta)}` : "";
  stream.write(`${new Date().toISOString()} [${level.toUpperCase()}] ${message}${metaStr}\n`);
}

function safeStringify(value: unknown): string {
  try { return JSON.stringify(value); } catch { return "[unserializable]"; }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
