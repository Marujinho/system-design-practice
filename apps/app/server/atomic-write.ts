import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * Write then rename in the same directory: a reader sees the old file or the
 * new one, never half of one, and a failed write leaves the old file intact
 * (PRD §12 A10).
 */
export function writeAtomic(
  path: string,
  text: string,
  ops: { rename: (from: string, to: string) => void } = { rename: renameSync },
): void {
  const tmp = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`,
  );
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    ops.rename(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // nothing left to clean
    }
    throw error;
  }
}
