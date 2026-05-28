import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 20 });
  return drizzle(pool, { schema });
}

export type DbClient = ReturnType<typeof createDb>;
export { createDb };