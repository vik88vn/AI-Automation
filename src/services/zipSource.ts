// ZIP source handling for the SaaS fix-agent flow.
//
// In SaaS mode the user's project doesn't live on the backend, so they upload
// a base64-encoded ZIP of their source. We extract it to a temp dir, let the
// FixAgent patch files there (its path-traversal guard keeps writes inside the
// dir), then re-zip the result for download.
//
// adm-zip is pure JS (no native bindings) so it deploys anywhere Node runs.

import AdmZip from "adm-zip";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Hard caps to prevent zip-bomb / resource exhaustion from untrusted uploads.
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB compressed
const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 500 * 1024 * 1024; // 500 MB uncompressed

export interface ExtractedSource {
  dir: string;
  cleanup: () => Promise<void>;
}

// Decode + extract a base64 ZIP into a fresh temp directory. Rejects oversized
// archives, too many entries, and any entry whose path escapes the temp dir
// (Zip Slip defense).
export async function extractZipToTemp(base64Zip: string): Promise<ExtractedSource> {
  const buffer = Buffer.from(base64Zip, "base64");
  if (buffer.length === 0) throw new Error("Empty or invalid base64 ZIP");
  if (buffer.length > MAX_ZIP_BYTES) {
    throw new Error(`ZIP too large (${buffer.length} bytes > ${MAX_ZIP_BYTES})`);
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`ZIP has too many entries (${entries.length} > ${MAX_ENTRIES})`);
  }
  let totalUncompressed = 0;
  for (const e of entries) {
    totalUncompressed += e.header.size;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error("ZIP uncompressed size exceeds limit (possible zip bomb)");
    }
  }

  const dir = await mkdtemp(path.join(tmpdir(), "qa-fix-src-"));
  const root = path.resolve(dir);

  // Zip Slip defense: verify each resolved entry path stays within root.
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const dest = path.resolve(root, entry.entryName);
    if (dest !== root && !dest.startsWith(root + path.sep)) {
      await rm(dir, { recursive: true, force: true });
      throw new Error(`ZIP entry escapes target dir: ${entry.entryName}`);
    }
  }

  zip.extractAllTo(root, /* overwrite */ true);

  return {
    dir: root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

// Re-zip a directory into a base64 string (for returning patched source).
export function zipDirToBase64(dir: string): string {
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  return zip.toBuffer().toString("base64");
}
