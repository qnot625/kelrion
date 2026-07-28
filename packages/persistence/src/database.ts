import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema.js";

/**
 * Driver-agnostic handle: the same repositories run against node-postgres in
 * production and PGlite (real Postgres, WASM) in tests.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
