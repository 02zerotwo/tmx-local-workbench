// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_VERSION } from "./schema";
import { createTestDatabase, type TestDatabase } from "./test-database";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

describe("AI database schema", () => {
  it("creates the persistent Agent and audit tables", () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);

    const tables = new Set((testDatabase.db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table'
    `).all() as Array<{ name: string }>).map(({ name }) => name));

    expect(testDatabase.db.pragma("user_version", { simple: true })).toBe(DATABASE_VERSION);
    expect([...tables]).toEqual(expect.arrayContaining([
      "ai_settings",
      "ai_agent_sessions",
      "ai_agent_messages",
      "ai_agent_runs",
      "ai_agent_tool_calls",
      "ai_agent_checkpoints",
      "ai_audit_jobs",
      "ai_audit_items",
      "ai_audit_findings",
      "ai_audit_apply_sets",
      "ai_audit_apply_items",
    ]));
  });
});
