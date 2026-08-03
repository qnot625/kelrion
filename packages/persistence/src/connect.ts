import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
// @ts-ignore
import pg from "pg";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export interface PostgresConnection {
  db: Database;
  close: () => Promise<void>;
}

export function connectPostgres(connectionString: string): PostgresConnection {
  const pool = new pg.Pool({ connectionString });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

/** Applies all schema migrations in sequence. Idempotent — every statement is IF NOT EXISTS. */
export async function runMigrations(db: Database): Promise<void> {
  const migrationsDir = new URL("../migrations/", import.meta.url);
  const migrationFiles = ["0001_initial.sql", "0002_queue_and_notifications.sql"];
  for (const file of migrationFiles) {
    const migrationPath = fileURLToPath(new URL(file, migrationsDir));
    const contents = await readFile(migrationPath, "utf8");
    for (const statement of splitSqlStatements(contents)) {
      await db.execute(sql.raw(statement));
    }
  }
}

/** Drivers reject multi-statement strings, so each statement is applied separately. */
export function splitSqlStatements(contents: string): string[] {
  return contents
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
