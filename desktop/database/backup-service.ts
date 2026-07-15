import Database from "better-sqlite3";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { openDatabase as openApplicationDatabase } from "./connection";
import { DATABASE_VERSION } from "./schema";

const REQUIRED_TABLES = ["projects", "translation_search", "translation_units"];

export type DatabaseBackupValidation = {
  valid: boolean;
  reason?: string;
};

export type DatabaseBackupServiceOptions = {
  databasePath: string;
  now?: () => Date;
  openDatabase?: typeof openApplicationDatabase;
};

export type DatabaseRestoreResult = {
  recoveryPath: string;
};

export function validateDatabaseBackup(path: string): DatabaseBackupValidation {
  if (!existsSync(path)) {
    return { valid: false, reason: "数据库备份文件不存在" };
  }

  let database: Database.Database | undefined;
  try {
    database = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = database.pragma("quick_check", { simple: true });
    if (integrity !== "ok") {
      return { valid: false, reason: "数据库备份完整性检查失败" };
    }

    const version = database.pragma("user_version", { simple: true }) as number;
    if (version !== DATABASE_VERSION) {
      return {
        valid: false,
        reason: `数据库备份版本不受支持：${version}`,
      };
    }

    const tables = (database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type IN ('table', 'view')
    `).all() as Array<{ name: string }>).map(({ name }) => name);
    const missingTable = REQUIRED_TABLES.find((table) => !tables.includes(table));
    if (missingTable) {
      return { valid: false, reason: `数据库备份缺少数据表：${missingTable}` };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : "数据库备份无法读取",
    };
  } finally {
    database?.close();
  }
}

export class DatabaseBackupService {
  private currentDatabase: Database.Database;
  private readonly now: () => Date;
  private readonly openDatabase: typeof openApplicationDatabase;
  readonly databasePath: string;

  constructor({
    databasePath,
    now = () => new Date(),
    openDatabase = openApplicationDatabase,
  }: DatabaseBackupServiceOptions) {
    this.databasePath = databasePath;
    this.now = now;
    this.openDatabase = openDatabase;
    this.currentDatabase = this.openDatabase(databasePath);
  }

  get database(): Database.Database {
    return this.currentDatabase;
  }

  backup(destinationPath: string): string {
    if (resolve(destinationPath) === resolve(this.databasePath)) {
      throw new Error("数据库备份位置不能覆盖当前数据库");
    }

    mkdirSync(dirname(destinationPath), { recursive: true });
    this.currentDatabase.pragma("wal_checkpoint(TRUNCATE)");
    copyFileSync(this.databasePath, destinationPath);

    const validation = validateDatabaseBackup(destinationPath);
    if (!validation.valid) {
      rmSync(destinationPath, { force: true });
      throw new Error(validation.reason ?? "数据库备份创建失败");
    }

    return destinationPath;
  }

  restore(backupPath: string): DatabaseRestoreResult {
    if (resolve(backupPath) === resolve(this.databasePath)) {
      throw new Error("不能从当前正在使用的数据库恢复");
    }

    const validation = validateDatabaseBackup(backupPath);
    if (!validation.valid) {
      throw new Error(validation.reason ?? "数据库备份无效");
    }

    const timestamp = this.now().toISOString().replace(/[:.]/g, "-");
    const recoveryPath = this.databasePath.replace(/\.db$/i, "")
      + `.pre-restore-${timestamp}.db`;
    this.backup(recoveryPath);
    this.currentDatabase.close();

    try {
      this.removeJournalFiles();
      copyFileSync(backupPath, this.databasePath);
      this.currentDatabase = this.openDatabase(this.databasePath);
      return { recoveryPath };
    } catch (restoreError) {
      this.removeJournalFiles();
      copyFileSync(recoveryPath, this.databasePath);
      this.currentDatabase = this.openDatabase(this.databasePath);
      throw restoreError;
    }
  }

  close(): void {
    if (this.currentDatabase.open) {
      this.currentDatabase.close();
    }
  }

  private removeJournalFiles(): void {
    rmSync(`${this.databasePath}-wal`, { force: true });
    rmSync(`${this.databasePath}-shm`, { force: true });
  }
}
