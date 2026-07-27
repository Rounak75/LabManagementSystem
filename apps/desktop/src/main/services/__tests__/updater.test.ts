import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the hoisted vi.mock factories below can safely reference these
// (vitest only auto-whitelists names that START with "mock"; vi.hoisted is the
// robust way to share fixtures with mock factories without TDZ errors).
const { listeners, autoUpdaterMock, logged, state } = vi.hoisted(() => {
  const listeners = new Map<string, (...a: any[]) => void>();
  const autoUpdaterMock = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: vi.fn((evt: string, cb: (...a: any[]) => void) => { listeners.set(evt, cb); }),
    checkForUpdates: vi.fn().mockResolvedValue(null),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  };
  const logged: string[] = [];
  const state = { isPackaged: true };
  return { listeners, autoUpdaterMock, logged, state };
});

vi.mock("electron", () => ({ app: { get isPackaged() { return state.isPackaged; } } }));
vi.mock("electron-updater", () => ({ autoUpdater: autoUpdaterMock }));
vi.mock("@main/services/logger", () => ({ logError: (s: string) => logged.push(s) }));

import { initAutoUpdater, checkNow, downloadUpdate, quitAndInstall } from "../updater";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.clearAllTimers(); // drop timers scheduled by a prior test's initAutoUpdater
  listeners.clear();
  logged.length = 0;
  state.isPackaged = true;
  autoUpdaterMock.autoDownload = true;
  autoUpdaterMock.autoInstallOnAppQuit = false;
});

describe("initAutoUpdater", () => {
  it("does nothing in dev (not packaged)", () => {
    state.isPackaged = false;
    initAutoUpdater(() => null);
    expect(autoUpdaterMock.on).not.toHaveBeenCalled();
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
  });

  // The installer is unsigned, so electron-updater has no signature to verify.
  // Downloading on the operator's say-so is what makes a malicious release
  // visible instead of silent; it is the only control standing in for signing.
  it("never downloads an update without the operator asking", () => {
    initAutoUpdater(() => null);
    expect(autoUpdaterMock.autoDownload).toBe(false);
  });

  it("registers handlers and still installs on quit once downloaded", () => {
    initAutoUpdater(() => null);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true);
    expect(listeners.has("update-available")).toBe(true);
    expect(listeners.has("update-downloaded")).toBe(true);
    expect(listeners.has("error")).toBe(true);
  });

  it("offers the update to the window instead of fetching it", () => {
    const send = vi.fn();
    const fakeWin = { webContents: { send } } as any;
    initAutoUpdater(() => fakeWin);

    listeners.get("update-available")!({ version: "2.0.0" });

    expect(send).toHaveBeenCalledWith("updater:update-available", { version: "2.0.0" });
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
  });

  it("downloadUpdate starts the download and swallows rejections", async () => {
    autoUpdaterMock.downloadUpdate.mockRejectedValueOnce(new Error("offline"));
    await expect(downloadUpdate()).resolves.toBeUndefined();
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(logged).toContain("updater:download");
  });

  it("checks for updates after the startup delay", () => {
    initAutoUpdater(() => null);
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("sends update-downloaded to the window with the version", () => {
    const send = vi.fn();
    const fakeWin = { webContents: { send } } as any;
    initAutoUpdater(() => fakeWin);
    listeners.get("update-downloaded")!({ version: "1.2.3" });
    expect(send).toHaveBeenCalledWith("updater:update-downloaded", { version: "1.2.3" });
  });

  it("logs updater errors instead of throwing", () => {
    initAutoUpdater(() => null);
    expect(() => listeners.get("error")!(new Error("net fail"))).not.toThrow();
    expect(logged).toContain("updater");
  });

  it("quitAndInstall delegates to autoUpdater", () => {
    quitAndInstall();
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalled();
  });

  it("checkNow triggers a check and swallows rejections", async () => {
    autoUpdaterMock.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    await expect(checkNow()).resolves.toBeUndefined();
  });
});
