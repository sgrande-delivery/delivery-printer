import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

// jsdom loads no font, and Icon renders the name as text whether or not the font carries it,
// so nothing else in the suite notices a name missing from the subset. This reads the woff2 by
// hand (node:zlib only) to answer the one question that matters: does a ligature exist for it.

// WOFF2 spec section 5.1: a table directory flag below 63 is an index into this list.
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
];

// Features a browser applies to text by default: a ligature outside them would not render as an icon.
const LIGATURE_FEATURES = new Set(['liga', 'rlig', 'rclt']);

function readTables(file: Buffer): Map<string, Buffer> {
  if (file.toString('latin1', 0, 4) !== 'wOF2') {
    throw new Error('not a woff2 file');
  }

  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let pos = 48;

  const readBase128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[pos++];
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return value;
      }
    }
    throw new Error('bad UIntBase128');
  };

  const directory: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[pos++];
    const index = flags & 0x3f;
    const transform = (flags >> 6) & 0x03;
    let tag = KNOWN_TAGS[index];
    if (index === 63) {
      tag = file.toString('latin1', pos, pos + 4);
      pos += 4;
    }
    const origLength = readBase128();
    // glyf/loca are transformed unless the version is 3; every other table, unless it is 0.
    const isGlyfLoca = tag === 'glyf' || tag === 'loca';
    const transformed = isGlyfLoca ? transform !== 3 : transform !== 0;
    directory.push({ tag, length: transformed ? readBase128() : origLength });
  }

  // One brotli stream for all tables, laid out back to back in directory order.
  const stream = brotliDecompressSync(file.subarray(pos, pos + compressedSize));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const { tag, length } of directory) {
    tables.set(tag, stream.subarray(offset, offset + length));
    offset += length;
  }
  return tables;
}

function readCmap(data: Buffer): Map<number, number> {
  const map = new Map<number, number>();
  const count = data.readUInt16BE(2);

  for (let i = 0; i < count; i++) {
    const offset = data.readUInt32BE(4 + i * 8 + 4);
    if (data.readUInt16BE(offset) !== 4) {
      continue;
    }
    const segmentsX2 = data.readUInt16BE(offset + 6);
    const endCodes = offset + 14;
    const startCodes = endCodes + segmentsX2 + 2;
    const deltas = startCodes + segmentsX2;
    const rangeOffsets = deltas + segmentsX2;

    for (let s = 0; s < segmentsX2 / 2; s++) {
      const end = data.readUInt16BE(endCodes + s * 2);
      const start = data.readUInt16BE(startCodes + s * 2);
      const delta = data.readInt16BE(deltas + s * 2);
      const rangeOffset = data.readUInt16BE(rangeOffsets + s * 2);
      if (start === 0xffff) {
        continue;
      }
      for (let code = start; code <= end; code++) {
        let glyph = (code + delta) & 0xffff;
        if (rangeOffset !== 0) {
          const at = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
          if (at + 1 >= data.length) {
            continue;
          }
          glyph = data.readUInt16BE(at);
          if (glyph !== 0) {
            glyph = (glyph + delta) & 0xffff;
          }
        }
        if (glyph !== 0) {
          map.set(code, glyph);
        }
      }
    }
  }
  return map;
}

function readCoverage(data: Buffer, offset: number): number[] {
  const format = data.readUInt16BE(offset);
  const count = data.readUInt16BE(offset + 2);
  const glyphs: number[] = [];

  if (format === 1) {
    for (let i = 0; i < count; i++) {
      glyphs.push(data.readUInt16BE(offset + 4 + i * 2));
    }
  } else if (format === 2) {
    for (let i = 0; i < count; i++) {
      const range = offset + 4 + i * 6;
      for (let g = data.readUInt16BE(range); g <= data.readUInt16BE(range + 2); g++) {
        glyphs.push(g);
      }
    }
  } else {
    throw new Error(`coverage format ${format}`);
  }
  return glyphs;
}

// Each ligature is the glyph sequence that triggers it, joined by ','.
function readLigatureSequences(gsub: Buffer): Set<string> {
  const featureList = gsub.readUInt16BE(6);
  const lookupList = gsub.readUInt16BE(8);

  const reachable = new Set<number>();
  const featureCount = gsub.readUInt16BE(featureList);
  for (let i = 0; i < featureCount; i++) {
    const record = featureList + 2 + i * 6;
    if (!LIGATURE_FEATURES.has(gsub.toString('latin1', record, record + 4))) {
      continue;
    }
    const feature = featureList + gsub.readUInt16BE(record + 4);
    for (let j = 0; j < gsub.readUInt16BE(feature + 2); j++) {
      reachable.add(gsub.readUInt16BE(feature + 4 + j * 2));
    }
  }

  const sequences = new Set<string>();
  const lookupCount = gsub.readUInt16BE(lookupList);
  for (let i = 0; i < lookupCount; i++) {
    if (!reachable.has(i)) {
      continue;
    }
    const lookup = lookupList + gsub.readUInt16BE(lookupList + 2 + i * 2);
    const type = gsub.readUInt16BE(lookup);

    for (let j = 0; j < gsub.readUInt16BE(lookup + 4); j++) {
      let subtable = lookup + gsub.readUInt16BE(lookup + 6 + j * 2);
      let realType = type;
      // Type 7 is an extension: the real type and a 32-bit offset to the real subtable live inside it.
      if (type === 7) {
        realType = gsub.readUInt16BE(subtable + 2);
        subtable += gsub.readUInt32BE(subtable + 4);
      }
      if (realType !== 4) {
        continue;
      }

      const firsts = readCoverage(gsub, subtable + gsub.readUInt16BE(subtable + 2));
      const setCount = gsub.readUInt16BE(subtable + 4);
      for (let k = 0; k < setCount; k++) {
        const set = subtable + gsub.readUInt16BE(subtable + 6 + k * 2);
        for (let l = 0; l < gsub.readUInt16BE(set); l++) {
          const ligature = set + gsub.readUInt16BE(set + 2 + l * 2);
          // componentCount includes the first glyph, which comes from the coverage table.
          const components = [firsts[k]];
          for (let c = 0; c < gsub.readUInt16BE(ligature + 2) - 1; c++) {
            components.push(gsub.readUInt16BE(ligature + 4 + c * 2));
          }
          sequences.add(components.join(','));
        }
      }
    }
  }
  return sequences;
}

export interface IconFont {
  /** True when typing exactly this name in the font produces a ligature glyph. */
  hasLigature(name: string): boolean;
  ligatureCount: number;
}

export function readIconFont(path: string): IconFont {
  const tables = readTables(readFileSync(path));
  const cmap = readCmap(tables.get('cmap') as Buffer);
  const sequences = readLigatureSequences(tables.get('GSUB') as Buffer);

  return {
    ligatureCount: sequences.size,
    hasLigature(name) {
      const glyphs = Array.from(name, char => cmap.get(char.codePointAt(0) as number));
      return !glyphs.includes(undefined) && sequences.has(glyphs.join(','));
    },
  };
}
