import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { runMigrations } from "./schema";

export type DatabasePathOptions = {
  portableDataDirectory?: string;
  portableDataDirectoryWritable: boolean;
  userDataDirectory: string;
  databaseFileName?: string;
};

export function resolveDatabasePath(_options: DatabasePathOptions): string {
  const {
    portableDataDirectory,
    portableDataDirectoryWritable,
    userDataDirectory,
    databaseFileName = "tmx-workbench.db",
  } = _options;
  const dataDirectory = portableDataDirectory && portableDataDirectoryWritable
    ? portableDataDirectory
    : userDataDirectory;

  return join(dataDirectory, databaseFileName);
}

export function openDatabase(databasePath: string): Database.Database {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);

  try {
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.pragma(databasePath === ":memory:"
      ? "journal_mode = MEMORY"
      : "journal_mode = WAL");
    runMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
