import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

type SafeStorageAdapter = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
};

type SecretStoreOptions = {
  directory: string;
  safeStorage: SafeStorageAdapter;
  fileName?: string;
};

export type DeepSeekKeyStatus = {
  configured: boolean;
  maskedKey: string | null;
};

export class DeepSeekSecretStore {
  private readonly filePath: string;

  constructor(private readonly options: SecretStoreOptions) {
    this.filePath = join(options.directory, options.fileName ?? "deepseek-api-key.bin");
  }

  async save(apiKey: string): Promise<void> {
    const normalizedKey = apiKey.trim();
    if (!normalizedKey) {
      throw new Error("DeepSeek API Key 不能为空");
    }
    if (!this.options.safeStorage.isEncryptionAvailable()) {
      throw new Error("系统加密服务不可用，无法安全保存 API Key");
    }
    const encrypted = this.options.safeStorage.encryptString(normalizedKey);
    await mkdir(this.options.directory, { recursive: true });
    await writeFile(this.filePath, encrypted, { mode: 0o600 });
  }

  async load(): Promise<string | null> {
    try {
      if (!this.options.safeStorage.isEncryptionAvailable()) {
        throw new Error("系统加密服务不可用，无法读取 API Key");
      }
      const encrypted = await readFile(this.filePath);
      return this.options.safeStorage.decryptString(encrypted);
    } catch (error) {
      if (isMissingFile(error)) {
        return null;
      }
      throw error;
    }
  }

  async getStatus(): Promise<DeepSeekKeyStatus> {
    const apiKey = await this.load();
    if (!apiKey) {
      return { configured: false, maskedKey: null };
    }
    return {
      configured: true,
      maskedKey: `••••${apiKey.slice(-4)}`,
    };
  }

  async delete(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error
    && error.code === "ENOENT");
}
