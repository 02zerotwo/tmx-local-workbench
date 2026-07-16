import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase as openApplicationDatabase } from "./connection";

export type TestDatabase = {
  db: Database.Database;
  path: string;
  cleanup: () => void;
};

export type TemporaryTestDatabaseOptions = {
  openDatabase?: typeof openApplicationDatabase;
};

export function createTestDatabase(): TestDatabase {
  const db = openApplicationDatabase(":memory:");

  return {
    db,
    path: ":memory:",
    cleanup: () => db.close(),
  };
}

export function createTemporaryTestDatabase(
  options: TemporaryTestDatabaseOptions = {},
): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), "tmx-workbench-db-"));
  const path = join(directory, "test.db");
  const openDatabase = options.openDatabase ?? openApplicationDatabase;

  try {
    const db = openDatabase(path);

    return {
      db,
      path,
      cleanup: () => {
        try {
          db.close();
        } finally {
          rmSync(directory, {
            force: true,
            maxRetries: 5,
            recursive: true,
            retryDelay: 50,
          });
        }
      },
    };
  } catch (error) {
    rmSync(directory, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 50,
    });
    throw error;
  }
}
