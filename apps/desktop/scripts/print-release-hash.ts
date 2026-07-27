/**
 * Prints the SHA-256 of every installer in `out/dist`, and writes it next to
 * them as `SHA256SUMS.txt`.
 *
 * The installer is not code-signed, and a certificate is out of budget. That
 * leaves a real gap: the lab is trained to click through the SmartScreen
 * "unknown publisher" warning, so an installer someone else sends them looks
 * exactly like one the owner built.
 *
 * A published hash does not close that gap — an attacker who can replace the
 * installer could also edit the release notes it is published in. What it does
 * close is the quieter and much likelier failure: a download that silently
 * truncated, a USB stick that corrupted a byte, or the wrong build being copied
 * to the lab. Those are the ones that actually happen, and right now nothing
 * would catch them.
 *
 * Run automatically by `package:win` and `release:win`. Verify on the lab PC:
 *
 *   certutil -hashfile "Golmuri Janch Ghar Lab Setup 0.1.0.exe" SHA256
 *
 * and compare against the value in the GitHub release notes.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(__dirname, "..", "out", "dist");

function sha256(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

async function main(): Promise<void> {
  if (!existsSync(DIST)) {
    // Not an error worth failing the build over — this runs after
    // electron-builder, and if that produced nothing it has already failed
    // louder than this would.
    console.warn(`[release-hash] no build output at ${DIST}; nothing to hash`);
    return;
  }

  const installers = readdirSync(DIST).filter((name) => name.endsWith(".exe"));
  if (installers.length === 0) {
    console.warn("[release-hash] no .exe found in out/dist; nothing to hash");
    return;
  }

  const lines: string[] = [];
  console.log("\n[release-hash] SHA-256 — paste these into the GitHub release notes:\n");
  for (const name of installers.sort()) {
    const digest = await sha256(join(DIST, name));
    // `sha256sum --check` format, so it can be verified with one command on any
    // machine that has coreutils rather than only by eye.
    lines.push(`${digest}  ${name}`);
    console.log(`  ${digest}  ${name}`);
  }

  const sumsPath = join(DIST, "SHA256SUMS.txt");
  writeFileSync(sumsPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\n[release-hash] written to ${sumsPath}\n`);
}

main().catch((err) => {
  console.error("[release-hash] failed:", err);
  process.exitCode = 1;
});
