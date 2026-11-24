// Pure helpers (no DOM) so they can be tested in Node: ID3 tag reading + backup file format.

// Reads title / artist / album / cover from an ID3v2.2–2.4 tag at the start of an MP3.
export function readID3(buf) {
  const u = new Uint8Array(buf), tags = {};
  if (u.length < 10 || u[0] !== 0x49 || u[1] !== 0x44 || u[2] !== 0x33) return tags;
  const ver = u[3], flags = u[5];
  const ss = i => (u[i] & 0x7f) << 21 | (u[i + 1] & 0x7f) << 14 | (u[i + 2] & 0x7f) << 7 | (u[i + 3] & 0x7f);
  const be32 = i => (u[i] << 24 | u[i + 1] << 16 | u[i + 2] << 8 | u[i + 3]) >>> 0;
  const end = Math.min(u.length, 10 + ss(6));
  let p = 10;
  if (flags & 0x40 && ver > 2) p += ver === 4 ? ss(10) : 4 + be32(10); // skip extended header
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
  const MAP = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', APIC: 'cover', PIC: 'cover' };
  while (p + hdr <= end) {
    const id = String.fromCharCode(...u.subarray(p, p + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // reached padding
    const size = ver === 2 ? (u[p + 3] << 16 | u[p + 4] << 8 | u[p + 5]) : ver === 4 ? ss(p + 4) : be32(p + 4);
    const f = u.subarray(p + hdr, Math.min(end, p + hdr + size));
    p += hdr + size;
    const key = MAP[id];
    if (!key || !f.length) continue;
    if (key !== 'cover') tags[key] = decodeText(f[0], f.subarray(1)) || undefined;
    else if (!tags.cover) tags.cover = readPic(f, ver);
  }
  return tags;
}

function decodeText(enc, b) {
  let label = ['windows-1252', 'utf-16le', 'utf-16be', 'utf-8'][enc] || 'windows-1252';
  if (enc === 1 && b[0] === 0xfe && b[1] === 0xff) label = 'utf-16be';
  return new TextDecoder(label).decode(b).replace(/^﻿/, '').split('\0')[0].trim();
}

function readPic(f, ver) {
  const enc = f[0];
  let i = 1, mime;
  if (ver === 2) { mime = String.fromCharCode(...f.subarray(1, 4)).toLowerCase(); i = 4; }
  else { while (i < f.length && f[i]) i++; mime = new TextDecoder('windows-1252').decode(f.subarray(1, i)).toLowerCase(); i++; }
  i++; // picture type
  if (enc === 1 || enc === 2) { while (i + 1 < f.length && (f[i] || f[i + 1])) i += 2; i += 2; }
  else { while (i < f.length && f[i]) i++; i++; }
  if (!mime.includes('/')) mime = 'image/' + (mime.replace('jpg', 'jpeg') || 'jpeg');
  return new Blob([f.slice(i)], { type: mime });
}

// Backup file (.melo): "MELO" + uint32 LE JSON length + JSON manifest + audio files back to back.
const MAGIC = 'MELO';

export function packBundle(manifest, blobs) {
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const head = new Uint8Array(8);
  head.set(new TextEncoder().encode(MAGIC));
  new DataView(head.buffer).setUint32(4, json.length, true);
  return new Blob([head, json, ...blobs], { type: 'application/octet-stream' });
}

// Returns null if the file is not a backup; throws if it is one but is damaged.
export async function unpackBundle(file) {
  if (file.size < 8) return null;
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (new TextDecoder().decode(head.subarray(0, 4)) !== MAGIC) return null;
  const len = new DataView(head.buffer).getUint32(4, true);
  if (8 + len > file.size) throw new Error('Sauvegarde corrompue');
  const manifest = JSON.parse(await file.slice(8, 8 + len).text());
  if (!Array.isArray(manifest.songs) || !Array.isArray(manifest.playlists)) throw new Error('Sauvegarde invalide');
  let off = 8 + len;
  const files = manifest.songs.map(s => {
    const n = Number(s.size);
    if (!(n >= 0) || off + n > file.size) throw new Error('Sauvegarde corrompue');
    const b = file.slice(off, off + n, String(s.type || 'audio/mpeg'));
    off += n;
    return b;
  });
  return { manifest, files };
}
