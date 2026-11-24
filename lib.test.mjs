// Run: node lib.test.mjs
import assert from 'node:assert/strict';
import { readID3, packBundle, unpackBundle } from './lib.js';

// Build an ID3v2.3 tag: UTF-16 title (with BOM), latin1 artist, APIC jpeg cover.
const frame = (id, body) => { const h = Buffer.alloc(10); h.write(id); h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
const title = frame('TIT2', Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from('Été ♪', 'utf16le')]));
const artist = frame('TPE1', Buffer.from('\0Daft Punk', 'latin1'));
const cover = frame('APIC', Buffer.concat([Buffer.from('\0image/jpeg\0\x03desc\0', 'latin1'), Buffer.from([0xff, 0xd8, 0xff, 0xe0])]));
const frames = Buffer.concat([title, artist, cover, Buffer.alloc(20)]); // + padding
const sz = frames.length, head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, sz >> 21 & 127, sz >> 14 & 127, sz >> 7 & 127, sz & 127]);
const mp3 = Buffer.concat([head, frames, Buffer.from([0xff, 0xfb, 0x90, 0x00])]);

const t = readID3(mp3.buffer.slice(mp3.byteOffset, mp3.byteOffset + mp3.length));
assert.equal(t.title, 'Été ♪');
assert.equal(t.artist, 'Daft Punk');
assert.equal(t.cover.type, 'image/jpeg');
assert.deepEqual([...new Uint8Array(await t.cover.arrayBuffer())], [0xff, 0xd8, 0xff, 0xe0]);
assert.deepEqual(readID3(new Uint8Array([1, 2, 3]).buffer), {});

// Backup round trip.
const a = new Blob(['song-a-bytes']), b = new Blob(['bb']);
const manifest = { app: 'melo', v: 1, songs: [{ id: 'a', size: a.size }, { id: 'b', size: b.size }], playlists: [{ id: 'p', name: 'Été', songIds: ['b', 'a'] }] };
const out = await unpackBundle(packBundle(manifest, [a, b]));
assert.deepEqual(out.manifest, manifest);
assert.equal(await out.files[0].text(), 'song-a-bytes');
assert.equal(await out.files[1].text(), 'bb');
assert.equal(await unpackBundle(new Blob(['not a backup file'])), null);
await assert.rejects(unpackBundle(packBundle(manifest, [a]))); // truncated

console.log('ok');
