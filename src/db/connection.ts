import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
});

export const db = drizzle(sql, { schema });
