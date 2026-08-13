import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` is hoisted above the file's own declarations, so the factory cannot
// close over an ordinary `const`. `vi.hoisted` puts the spy where the factory
// can already see it — the holder pattern used elsewhere in this suite.
const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }));
vi.mock("electron", () => ({ shell: { openExternal } }));

import {
  isInternalUrl,
  openExternally,
  rendererCsp,
} from "../window-guards";

beforeEach(() => openExternal.mockReset());

describe("isInternalUrl", () => {
  // Packaged builds load the renderer with loadFile.
  it("accepts the packaged renderer's own file URL", () => {
    expect(isInternalUrl("file:///C:/Program%20Files/lab/renderer/index.html")).toBe(true);
  });

  it("accepts the dev server it was told about", () => {
    expect(isInternalUrl("http://localhost:5173/index.html", "http://localhost:5173")).toBe(true);
  });

  // Compared by origin rather than by prefix. `startsWith` would have accepted
  // this, and it is a domain an attacker can register.
  it("rejects a host that merely starts with the dev server's address", () => {
    expect(isInternalUrl("http://localhost:5173.evil.test/", "http://localhost:5173")).toBe(false);
  });

  it("rejects the open internet", () => {
    expect(isInternalUrl("https://evil.test/phish")).toBe(false);
  });

  it("rejects the dev server when there is no dev server", () => {
    expect(isInternalUrl("http://localhost:5173/")).toBe(false);
  });

  it("rejects a string that is not a URL", () => {
    expect(isInternalUrl("javascript:alert(1)")).toBe(false);
    expect(isInternalUrl("not a url at all")).toBe(false);
  });
});

describe("openExternally", () => {
  it("hands a web page to the operating system", () => {
    openExternally("https://golmurijanchghar.example/portal");

    expect(openExternal).toHaveBeenCalledWith("https://golmurijanchghar.example/portal");
  });

  it("hands over mailto and tel, which the lab's own pages use", () => {
    openExternally("mailto:lab@example.test");
    openExternally("tel:6202924306");

    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  // shell.openExternal passes the string to the OS, which will act on schemes
  // that are not web pages. An allow-list is the whole point of this function.
  it("refuses a scheme that is not a web page", () => {
    openExternally("file:///C:/Windows/System32/cmd.exe");
    openExternally("javascript:alert(1)");
    openExternally("ms-msdt:/id PCWDiagnostic");

    expect(openExternal).not.toHaveBeenCalled();
  });

  it("refuses something that does not parse", () => {
    openExternally("¯\\_(ツ)_/¯");

    expect(openExternal).not.toHaveBeenCalled();
  });
});

describe("rendererCsp", () => {
  // The bundle is built into files by Vite, so nothing in the packaged window
  // needs to run an inline script and there is no reason to permit one.
  it("forbids inline scripts in a packaged build", () => {
    const csp = rendererCsp();

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("'unsafe-inline' 'unsafe-eval'");
  });

  it("permits what hot reload needs in development only", () => {
    expect(rendererCsp({ dev: true })).toContain("'unsafe-eval'");
    expect(rendererCsp({ dev: true })).toContain("ws:");
    expect(rendererCsp()).not.toContain("ws:");
  });

  // React writes style attributes and there is no nonce to give them here.
  // Allowed knowingly, and only for styles.
  it("permits inline styles but not inline scripts", () => {
    const csp = rendererCsp();

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src 'self'");
  });

  // The renderer reaches Supabase through IPC, never directly.
  it("confines the renderer's network access to itself", () => {
    expect(rendererCsp()).toContain("connect-src 'self'");
  });

  it("forbids being framed and forbids framing anything out", () => {
    const csp = rendererCsp();

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
