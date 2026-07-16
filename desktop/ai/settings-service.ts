import type Database from "better-sqlite3";
import type { AiAuditDefaults } from "../../src/lib/desktop-types";
import type { DeepSeekKeyStatus } from "./secret-store";
import {
  checkDeepSeekConnection,
  type DeepSeekModelId,
} from "./deepseek-client";

const DEFAULT_AUDIT_DEFAULTS: AiAuditDefaults = {
  customRules: "",
  minConfidence: 0.8,
  allowRewrite: true,
  concurrency: 8,
};

function clampConcurrency(value: unknown): number {
  const n = typeof value === "number" ? value : 8;
  return Math.min(20, Math.max(1, Math.trunc(n)));
}

function normalizeAuditDefaults(raw: unknown): AiAuditDefaults {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    customRules: typeof value.customRules === "string" ? value.customRules : "",
    minConfidence:
      typeof value.minConfidence === "number" ? value.minConfidence : 0.8,
    allowRewrite: value.allowRewrite !== false,
    concurrency: clampConcurrency(value.concurrency),
  };
}

export type DeepSeekSettingsStatus = DeepSeekKeyStatus & {
  model: DeepSeekModelId;
  verifiedAt: string | null;
};

type SecretStoreAdapter = {
  save: (apiKey: string) => Promise<void>;
  load: () => Promise<string | null>;
  delete: () => Promise<void>;
  getStatus: () => Promise<DeepSeekKeyStatus>;
};

type SettingsServiceOptions = {
  db: Database.Database;
  secretStore: SecretStoreAdapter;
  now?: () => Date;
  checkConnection?: typeof checkDeepSeekConnection;
};

type SettingsRow = {
  model: DeepSeekModelId;
  key_verified_at: string | null;
};

const DEFAULT_MODEL: DeepSeekModelId = "deepseek-v4-flash";

export class DeepSeekSettingsService {
  private readonly now: () => Date;
  private readonly checkConnection: typeof checkDeepSeekConnection;

  constructor(private readonly options: SettingsServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.checkConnection = options.checkConnection ?? checkDeepSeekConnection;
  }

  async getStatus(): Promise<DeepSeekSettingsStatus> {
    const keyStatus = await this.options.secretStore.getStatus();
    const settings = this.readSettings();
    return {
      ...keyStatus,
      model: settings?.model ?? DEFAULT_MODEL,
      verifiedAt: keyStatus.configured ? settings?.key_verified_at ?? null : null,
    };
  }

  async saveAndVerifyKey(apiKey: string): Promise<DeepSeekSettingsStatus> {
    const normalizedKey = apiKey.trim();
    const model = this.readSettings()?.model ?? DEFAULT_MODEL;
    await this.checkConnection(normalizedKey, model);
    await this.options.secretStore.save(normalizedKey);
    this.upsertSettings(model, this.now().toISOString());
    return this.getStatus();
  }

  async verifyConnection(): Promise<DeepSeekSettingsStatus> {
    const apiKey = await this.options.secretStore.load();
    if (!apiKey) {
      throw new Error("请先配置 DeepSeek API Key");
    }
    const model = this.readSettings()?.model ?? DEFAULT_MODEL;
    await this.checkConnection(apiKey, model);
    this.upsertSettings(model, this.now().toISOString());
    return this.getStatus();
  }

  async deleteKey(): Promise<DeepSeekSettingsStatus> {
    await this.options.secretStore.delete();
    const model = this.readSettings()?.model ?? DEFAULT_MODEL;
    this.upsertSettings(model, null);
    return this.getStatus();
  }

  async getApiKeyForMainProcess(): Promise<string> {
    const apiKey = await this.options.secretStore.load();
    if (!apiKey) {
      throw new Error("请先配置 DeepSeek API Key");
    }
    return apiKey;
  }

  getModel(): DeepSeekModelId {
    return this.readSettings()?.model ?? DEFAULT_MODEL;
  }

  setModel(model: DeepSeekModelId): void {
    const verifiedAt = this.readSettings()?.key_verified_at ?? null;
    this.upsertSettings(model, verifiedAt);
  }

  getAuditDefaults(): AiAuditDefaults {
    const row = this.options.db.prepare(`
      SELECT rules_json FROM ai_settings WHERE id = 1
    `).get() as { rules_json: string } | undefined;
    if (!row) {
      return { ...DEFAULT_AUDIT_DEFAULTS };
    }
    try {
      return normalizeAuditDefaults(JSON.parse(row.rules_json));
    } catch {
      return { ...DEFAULT_AUDIT_DEFAULTS };
    }
  }

  saveAuditDefaults(defaults: AiAuditDefaults): AiAuditDefaults {
    const normalized = normalizeAuditDefaults(defaults);
    const timestamp = this.now().toISOString();
    this.options.db.prepare(`
      INSERT INTO ai_settings (
        id, model, rules_json, key_verified_at, created_at, updated_at
      ) VALUES (1, ?, ?, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        rules_json = excluded.rules_json,
        updated_at = excluded.updated_at
    `).run(this.getModel(), JSON.stringify(normalized), timestamp, timestamp);
    return normalized;
  }

  private readSettings(): SettingsRow | null {
    return (this.options.db.prepare(`
      SELECT model, key_verified_at FROM ai_settings WHERE id = 1
    `).get() as SettingsRow | undefined) ?? null;
  }

  private upsertSettings(model: DeepSeekModelId, verifiedAt: string | null): void {
    const timestamp = this.now().toISOString();
    this.options.db.prepare(`
      INSERT INTO ai_settings (
        id, model, rules_json, key_verified_at, created_at, updated_at
      ) VALUES (1, ?, '{}', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        model = excluded.model,
        key_verified_at = excluded.key_verified_at,
        updated_at = excluded.updated_at
    `).run(model, verifiedAt, timestamp, timestamp);
  }
}
