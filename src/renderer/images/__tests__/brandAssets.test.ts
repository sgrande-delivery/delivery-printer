import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

// The three brand PNGs shipped corrupt for eleven tasks: structurally they had a valid signature,
// an IHDR with the right dimensions and an IEND, so `file` and every editor called them PNGs — but
// their IDAT failed CRC, so no decoder could draw them. Nothing here caught it, because the suite
// only ever imported the asset for its URL and never looked at the bytes. A human running the
// packaged app found it. This test is the net that was missing: it decodes, it does not inspect
// headers.
// Both trees ship: src/renderer/images is bundled into the renderer, assets/ holds the tray and
// installer icons that electron-builder packs. The same bad import could land in either.
const IMAGE_DIRS = [join(__dirname, '..'), join(__dirname, '..', '..', '..', '..', 'assets')];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function listImages(extension: string): string[] {
  return IMAGE_DIRS.flatMap(dir =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(extension))
      .map(entry => join(entry.parentPath, entry.name))
  );
}

describe('the images that ship inside the installer', () => {
  it.each(listImages('.png'))('%s decodes as a PNG', file => {
    const bytes = readFileSync(file);

    expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    // Walking the chunks is what proves the file whole: a truncated PNG keeps its signature, and a
    // mangled one keeps its IEND. Only the per-chunk CRC and the inflate of IDAT disagree.
    const pixels: Buffer[] = [];
    let offset = 8;

    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8);
      const data = bytes.subarray(offset + 8, offset + 8 + length);

      expect(data.length, `${file}: chunk ${type.toString('latin1')} is truncated`).toBe(length);
      expect(bytes.readUInt32BE(offset + 8 + length), `${file}: chunk ${type.toString('latin1')} failed its CRC`).toBe(
        crc32(Buffer.concat([type, data]))
      );

      if (type.toString('latin1') === 'IDAT') {
        pixels.push(data);
      }

      offset += 12 + length;
    }

    expect(() => inflateSync(Buffer.concat(pixels)), `${file}: the pixel data does not inflate`).not.toThrow();
  });

  it.each(listImages('.svg'))('%s parses as an SVG and carries no script', file => {
    const markup = readFileSync(file, 'utf8');
    const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;

    expect(root.querySelector('parsererror'), `${file}: is not well-formed XML`).toBeNull();
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('viewBox'), `${file}: without a viewBox it cannot scale`).toBeTruthy();
    expect(root.querySelectorAll('path').length, `${file}: has no drawing in it`).toBeGreaterThan(0);

    // These files come from outside the repo (the brand package in Claude Design) and are rendered
    // by the app, so an inline script would run with the renderer's privileges.
    expect(markup).not.toMatch(/<script|\son\w+=|javascript:/i);
  });
});
