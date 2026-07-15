// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DeepSeekSecretStore } from "./secret-store";

const directories: string[] = [];

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { force: true, recursive: true });
  }
});

describe("DeepSeekSecretStore", () => {
  it("encrypts the key on disk and exposes only masked status", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tmx-ai-key-"));
    directories.push(directory);
    const store = new DeepSeekSecretStore({
      directory,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
        decryptString: (value) => value.toString("utf8").replace("encrypted:", ""),
      },
    });

    await store.save("sk-secret-1234");

    expect(await store.getStatus()).toEqual({ configured: true, maskedKey: "••••1234" });
    expect(await store.load()).toBe("sk-secret-1234");
    await store.delete();
    expect(await store.getStatus()).toEqual({ configured: false, maskedKey: null });
  });

  it("rejects saving when operating-system encryption is unavailable", async () => {
    const directory = mkdtempSync(join(tmpdir(), "tmx-ai-key-"));
    directories.push(directory);
    const store = new DeepSeekSecretStore({
      directory,
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => "",
      },
    });

    await expect(store.save("sk-secret")).rejects.toThrow("系统加密服务不可用");
  });
});
