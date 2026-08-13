// What the renderer window is allowed to do besides render.
//
// `contextIsolation: true` and `nodeIntegration: false` were already set, and
// they are the two that matter most — the renderer cannot reach Node and cannot
// reach into the preload's scope. What was missing is the layer under them:
// nothing said where the window may *navigate*, and nothing said what a request
// for a new window should do.
//
// That gap is worth closing even though the renderer only ever loads local
// files. Every patient name, doctor's note and test comment in the lab is
// rendered into this window, and one of them one day containing something that
// causes a navigation — a stray anchor, a paste of markup into a notes field, a
// bug in a future screen — is the difference between "the app showed something
// odd" and "the app is now displaying an attacker's page inside a trusted
// frame, with the lab's own chrome around it".
//
// A new window is the sharper half. `window.open` from the renderer creates a
// second BrowserWindow with Electron's *defaults*, not the ones set in
// `createWindow`, and the app has no use for a second window at all.

import { shell, type BrowserWindow, type Session } from "electron";

/** Schemes that may be handed to the operating system's browser. */
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Whether a URL is the app's own renderer rather than somewhere else. */
export function isInternalUrl(url: string, devServerUrl?: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a URL at all. Nothing legitimate produces this, so it is not internal.
    return false;
  }

  // Packaged: the renderer is loaded from disk with loadFile.
  if (parsed.protocol === "file:") return true;

  // Development: Vite serves the renderer over http on localhost. Compared by
  // origin rather than by prefix, so a URL that merely *begins* with the dev
  // server's address — `http://localhost:5173.evil.test` — does not pass.
  if (devServerUrl) {
    try {
      if (parsed.origin === new URL(devServerUrl).origin) return true;
    } catch {
      /* a malformed ELECTRON_RENDERER_URL is not a reason to trust anything */
    }
  }

  return false;
}

/**
 * Opens a URL in the operating system's browser, if it is the sort of URL a
 * browser should be given.
 *
 * The scheme check is the point. `shell.openExternal` hands the string to the
 * OS, and on Windows that will happily act on schemes that are not web pages at
 * all — so it is given an allow-list rather than whatever the renderer asked for.
 */
export function openExternally(url: string): void {
  try {
    if (EXTERNAL_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url);
  } catch {
    /* unparseable: drop it silently, exactly as an unknown scheme is dropped */
  }
}

/**
 * Refuses navigation away from the app, and refuses new windows outright.
 *
 * Anything genuinely meant for a browser — the patient portal's address, a
 * `mailto:` to the lab — still works: it is handed to the OS browser instead,
 * which is where the owner expects a link to open anyway.
 */
export function applyNavigationGuards(win: BrowserWindow, devServerUrl?: string): void {
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url, devServerUrl)) return;
    event.preventDefault();
    openExternally(url);
  });

  // A second BrowserWindow would be created with Electron's default
  // webPreferences rather than the hardened ones in `createWindow` — no context
  // isolation among them. The app has one window by design, so this is a flat no.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  // Covers the case the two handlers above do not: a redirect that has already
  // committed. Nothing in this app should ever reach it.
  win.webContents.on("will-redirect", (event, url) => {
    if (isInternalUrl(url, devServerUrl)) return;
    event.preventDefault();
  });
}

/**
 * The renderer's Content-Security-Policy.
 *
 * Deliberately looser than the web apps' policies in one place: `style-src`
 * allows inline styles, because React writes `style="..."` attributes and there
 * is no nonce to give them here. Scripts get no such allowance — the bundle is
 * built by Vite into files, so nothing in this window needs to run an inline
 * script, and saying so costs nothing.
 *
 * `connect-src 'self'` is safe because the renderer talks to Supabase through
 * IPC, never directly: the cloud client lives in the main process under
 * `services/cloud/`. In development Vite's hot reload needs its websocket, which
 * is the only reason `dev` widens it.
 */
export function rendererCsp({ dev = false }: { dev?: boolean } = {}): string {
  return [
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    // `data:` covers the lab logo, which is stored as a data URI, and the QR
    // codes generated for UPI payment.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    dev ? "connect-src 'self' ws: http://localhost:*" : "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * Attaches the CSP to every response the renderer's session serves.
 *
 * Done as a response header rather than a `<meta>` tag in index.html so it also
 * covers responses the renderer fetches after load, and so it cannot be dropped
 * by an edit to the HTML template.
 */
export function applyRendererCsp(session: Session, { dev = false }: { dev?: boolean } = {}): void {
  const csp = rendererCsp({ dev });
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });
}
