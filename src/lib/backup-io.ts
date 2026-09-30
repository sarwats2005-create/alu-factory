import path from "path";
import { AppError } from "@/lib/api";

/* ==========================================================================
   Backup file storage
   --------------------------------------------------------------------------
   Backups are plain JSON files on the server's disk. Keeping every disk touch
   in one module means the Cloudflare Workers incompatibility (no writable
   `fs`) fails with a clear message at exactly one place, instead of
   surfacing as an opaque crash inside a route handler.
   ========================================================================== */

export const BACKUP_DIR_NAME = "backups";

function dir(): string {
  return path.join(process.cwd(), BACKUP_DIR_NAME);
}

function filePath(filename: string): string {
  // Defend against a crafted filename escaping the backup directory.
  const safe = path.basename(filename);
  if (!safe || safe !== filename) {
    throw new AppError("Invalid backup filename.", 400, "BACKUP_INVALID_NAME");
  }
  return path.join(dir(), safe);
}

/** Best-effort check so callers can degrade gracefully instead of throwing. */
export async function backupFilesWritable(): Promise<boolean> {
  try {
    const fs = await import("fs/promises");
    await fs.mkdir(dir(), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

export async function writeBackupFile(filename: string, contents: string): Promise<void> {
  const fs = await import("fs/promises").catch(() => null);
  if (!fs) {
    throw new AppError(
      "This host cannot store backup files. Use “Export JSON” to download a copy instead.",
      500,
      "BACKUP_NO_FS"
    );
  }
  try {
    await fs.mkdir(dir(), { recursive: true });
    await fs.writeFile(filePath(filename), contents);
  } catch (e) {
    throw new AppError(
      `Could not write the backup file: ${e instanceof Error ? e.message : String(e)}`,
      500,
      "BACKUP_WRITE_FAIL"
    );
  }
}

export async function readBackupFile(filename: string): Promise<string> {
  const fs = await import("fs/promises").catch(() => null);
  if (!fs) {
    throw new AppError("This host cannot read backup files from disk.", 500, "BACKUP_NO_FS");
  }
  try {
    return await fs.readFile(filePath(filename), "utf-8");
  } catch {
    throw new AppError("Backup file could not be read from disk.", 400, "BACKUP_READ_FAIL");
  }
}

export async function deleteBackupFile(filename: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.unlink(filePath(filename));
  } catch {
    /* already gone, or never written — deleting the row is still correct */
  }
}