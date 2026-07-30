import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
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

/** Applies every SQL migration in filename order. Statements remain idempotent. */
export async function runMigrations(db: Database): Promise<void> {
  const migrationDirectory = fileURLToPath(new URL("../migrations", import.meta.url));
  const files = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const contents = await readFile(`${migrationDirectory}/${file}`, "utf8");
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
