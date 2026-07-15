// @vitest-environment node

import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "./ipc/channels";
import { protectUnsavedChanges } from "./window";

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  shell: { openExternal: vi.fn() },
}));

class FakeWindow extends EventEmitter {
  readonly destroy = vi.fn();
  readonly webContents = {
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  };

  readonly close = vi.fn(() => {
    this.emit("close", { preventDefault: vi.fn() });
  });
}

describe("protectUnsavedChanges", () => {
  afterEach(() => vi.useRealTimers());

  it("never force destroys the window before the renderer confirms saving", () => {
    vi.useFakeTimers();
    const window = new FakeWindow();
    const controller = protectUnsavedChanges(window as unknown as BrowserWindow);
    const event = { preventDefault: vi.fn() };

    window.emit("close", event);
    vi.advanceTimersByTime(30_000);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(window.webContents.send).toHaveBeenCalledWith(
      IPC_CHANNELS.events.appCloseRequested,
    );
    expect(window.destroy).not.toHaveBeenCalled();

    controller.confirm();
    expect(window.close).toHaveBeenCalledTimes(1);
  });
});
