import { SQLDatabase } from "encore.dev/storage/sqldb";
import type { ConversationState, StateAccessor } from "@openrouter/agent";

export const db = new SQLDatabase("watcher", { migrations: "./migrations" });

export async function isSeen(id: string) {
  return !!(await db.queryRow`
    SELECT 1 AS x FROM seen_stories WHERE id = ${id} UNION ALL SELECT 1 FROM fetched_stories WHERE id = ${id} LIMIT 1`);
}
export async function addFetched(ids: string[]) {
  for (const id of ids) await db.exec`INSERT INTO fetched_stories (id) VALUES (${id}) ON CONFLICT DO NOTHING`;
}
export async function countFetched() {
  return Number((await db.queryRow<{ n: number }>`SELECT count(*)::int AS n FROM fetched_stories`)!.n);
}
/** Move this run's fetched stories into seen_stories, in one transaction. */
export async function markSeen() {
  const tx = await db.begin();
  try {
    await tx.exec`INSERT INTO seen_stories (id) SELECT id FROM fetched_stories ON CONFLICT DO NOTHING`;
    await tx.exec`DELETE FROM fetched_stories`;
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/** The SDK's StateAccessor, backed by Postgres instead of state.json. */
export const state: StateAccessor = {
  load: async () => {
    const row = await db.queryRow<{ state: string }>`SELECT state FROM agent_state WHERE id = 'main'`;
    return row ? (JSON.parse(row.state) as ConversationState) : null;
  },
  save: async (s) => {
    await db.exec`INSERT INTO agent_state (id, state) VALUES ('main', ${JSON.stringify(s)})
      ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`;
  },
};
export const clearState = () => db.exec`DELETE FROM agent_state WHERE id = 'main'`;
