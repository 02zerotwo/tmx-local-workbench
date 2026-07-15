// @vitest-environment node

import Database from "better-sqlite3";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./connection";
import { DatabaseBackupService, validateDatabaseBackup } from "./backup-service";
import { ProjectRepository } from "./project-repository";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "tmx-backup-test-"));
  directories.push(directory);
  return directory;
}

function addProject(database: Database.Database, id: string, name: string): void {
  new ProjectRepository(database, { createId: () => id }).createProject({
    name,
    sourceFileName: `${name}.tmx`,
    sourceLanguage: "zh-CN",
    targetLanguages: ["en-US"],
    fileSize: 100,
    importStatus: "ready",
  });
}

function projectNames(database: Database.Database): string[] {
  return new ProjectRepository(database).listProjects().map(({ name }) => name);
}

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true });
  }
});

describe("DatabaseBackupService", () => {
  it("checkpoints WAL and creates a valid backup containing current data", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "active.db");
    const backupPath = join(directory, "backup.db");
    const service = new DatabaseBackupService({ databasePath });

    try {
      addProject(service.database, "current", "Current project");
      expect(service.backup(backupPath)).toBe(backupPath);
      expect(existsSync(backupPath)).toBe(true);
      expect(validateDatabaseBackup(backupPath)).toMatchObject({ valid: true });

      const backup = new Database(backupPath, { readonly: true });
      try {
        expect(projectNames(backup)).toEqual(["Current project"]);
      } finally {
        backup.close();
      }
    } finally {
      service.close();
    }
  });

  it("rejects files without the expected schema and keeps the active database open", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "active.db");
    const invalidPath = join(directory, "invalid.db");
    const invalid = new Database(invalidPath);
    invalid.exec("CREATE TABLE unrelated (id INTEGER)");
    invalid.close();
    const service = new DatabaseBackupService({ databasePath });

    try {
      addProject(service.database, "current", "Current project");
      expect(validateDatabaseBackup(invalidPath)).toMatchObject({ valid: false });
      expect(() => service.restore(invalidPath)).toThrow(/备份|数据库/);
      expect(projectNames(service.database)).toEqual(["Current project"]);
      expect(service.database.open).toBe(true);
    } finally {
      service.close();
    }
  });

  it("backs up the current database before replacing it during restore", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "active.db");
    const restorePath = join(directory, "restore-source.db");
    const restoreSource = openDatabase(restorePath);
    addProject(restoreSource, "restored", "Restored project");
    restoreSource.close();
    const service = new DatabaseBackupService({
      databasePath,
      now: () => new Date("2026-07-14T08:09:10.000Z"),
    });

    try {
      addProject(service.database, "current", "Current project");
      const result = service.restore(restorePath);

      expect(projectNames(service.database)).toEqual(["Restored project"]);
      expect(result.recoveryPath).toContain("pre-restore-2026-07-14T08-09-10-000Z.db");
      expect(existsSync(result.recoveryPath)).toBe(true);

      const recovery = new Database(result.recoveryPath, { readonly: true });
      try {
        expect(projectNames(recovery)).toEqual(["Current project"]);
      } finally {
        recovery.close();
      }
    } finally {
      service.close();
    }
  });
});
