import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "./connection";

await migrate(db, {
  migrationsFolder: "./drizzle",
});

await sql.end();
