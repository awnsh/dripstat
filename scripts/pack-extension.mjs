// Zips extension/ into dripstat-live.zip at the site root, which the site's
// download buttons serve. Run after changing the extension:
//   npm run pack
// No dependencies: a minimal zip writer using Node's built-in deflate.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'extension');
const out = resolve(root, 'dripstat-live.zip');

const walk = dir => readdirSync(dir).sort().flatMap(n => {
  const p = resolve(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// Fixed timestamp (2026-01-01 00:00) so rebuilding unchanged files gives an identical zip.
const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const local = [], central = [];
let offset = 0;
for (const file of walk(src)) {
  const name = Buffer.from('dripstat-live/' + relative(src, file).replace(/\\/g, '/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
  head.writeUInt16LE(8, 8); head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(8, 10); dir.writeUInt16LE(DOS_TIME, 12); dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
  local.push(head, name, packed);
  central.push(dir, name);
  offset += head.length + name.length + packed.length;
}
const cdSize = central.reduce((a, b) => a + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
writeFileSync(out, Buffer.concat([...local, ...central, end]));
console.log(`wrote ${relative(root, out)} (${central.length / 2} files)`);
