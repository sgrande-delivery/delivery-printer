import fs from 'node:fs';

// The temporary file sits in the same directory because rename is only atomic
// inside one volume. The fsync before the rename is what makes the content
// durable: without it a power cut can leave the final name pointing at an empty
// file. The final path is never opened for writing.
export function writeFileAtomic(file: string, content: string): void {
  const temp = `${file}.tmp`;

  try {
    const fd = fs.openSync(temp, 'w');

    try {
      fs.writeSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(temp, file);
  } catch (err: unknown) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}
