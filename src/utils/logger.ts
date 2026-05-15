import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

const cloudRunFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  return JSON.stringify({
    severity: level.toUpperCase(),
    time: timestamp,
    message,
    ...meta,
  });
});

const devFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction ? cloudRunFormat : winston.format.combine(winston.format.colorize(), devFormat),
  ),
  transports: [new winston.transports.Console()],
});
