// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../database/test-database";
import { DeepSeekSettingsService } from "./settings-service";

const databases: TestDatabase[] = [];

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.cleanup();
  }
});

describe("DeepSeekSettingsService", () => {
  it("saves, verifies, and reports a key without exposing plaintext", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    let key: string | null = null;
    const checkConnection = vi.fn().mockResolvedValue(undefined);
    const service = new DeepSeekSettingsService({
      db: testDatabase.db,
      now: () => new Date("2026-07-15T06:00:00.000Z"),
      checkConnection,
      secretStore: {
        save: async (value) => { key = value; },
        load: async () => key,
        delete: async () => { key = null; },
        getStatus: async () => ({
          configured: key !== null,
          maskedKey: key ? `••••${key.slice(-4)}` : null,
        }),
      },
    });

    const status = await service.saveAndVerifyKey("sk-deepseek-5678");

    expect(checkConnection).toHaveBeenCalledWith("sk-deepseek-5678", "deepseek-v4-flash");
    expect(status).toEqual({
      configured: true,
      maskedKey: "••••5678",
      model: "deepseek-v4-flash",
      verifiedAt: "2026-07-15T06:00:00.000Z",
    });
    expect(JSON.stringify(status)).not.toContain("sk-deepseek");
  });

  it("does not persist a key when connection verification fails", async () => {
    const testDatabase = createTestDatabase();
    databases.push(testDatabase);
    const save = vi.fn();
    const service = new DeepSeekSettingsService({
      db: testDatabase.db,
      checkConnection: vi.fn().mockRejectedValue(new Error("API Key 无效")),
      secretStore: {
        save,
        load: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
        getStatus: vi.fn().mockResolvedValue({ configured: false, maskedKey: null }),
      },
    });

    await expect(service.saveAndVerifyKey("sk-invalid")).rejects.toThrow("API Key 无效");
    expect(save).not.toHaveBeenCalled();
  });
});
