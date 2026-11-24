import { readID3, packBundle, unpackBundle } from './lib.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = t => { t = Math.floor(t || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  next: 'M6 6l8.5 6L6 18zM16 6h2v12h-2z',
  prev: 'M18 6l-8.5 6L18 18zM6 6h2v12H6z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  heartO: 'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z',
  more: 'M6 10a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4zm6 0a2 2 0 100 4 2 2 0 000-4z',
  note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
};
const icon = n => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n]}"/></svg>`;

// ---------- Storage: IndexedDB (songs = metadata + cover, files = audio, playlists) ----------
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('melo', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('songs', { keyPath: 'id' });
    r.result.createObjectStore('files');
    r.result.createObjectStore('playlists', { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (n, mode = 'readonly') => (await dbp).transaction(n, mode).objectStore(n);
const getAll = async n => req((await store(n)).getAll());
const get = async (n, k) => req((await store(n)).get(k));
const put = async (n, v, k) => req((await store(n, 'readwrite')).put(v, k));
const del = async (n, k) => req((await store(n, 'readwrite')).delete(k));

const S = { songs: new Map(), playlists: new Map(), view: 'library', query: '', shown: [] };
const coverUrls = new Map();
const coverUrl = s => {
  if (!s?.cover) return '';
  if (!coverUrls.has(s.id)) coverUrls.set(s.id, URL.createObjectURL(s.cover));
  return coverUrls.get(s.id);
};
const coverHtml = (s, cls = 'cover') => s?.cover ? `<img class="${cls}" src="${coverUrl(s)}" alt="" loading="lazy">` : `<div class="${cls}">${icon('note')}</div>`;

// ---------- Import / export ----------
const hashHex = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf)).slice(0, 12)]
  .map(x => x.toString(16).padStart(2, '0')).join('');

const getDuration = blob => new Promise(res => {
  const a = new Audio(), url = URL.createObjectURL(blob);
  const done = d => { URL.revokeObjectURL(url); res(isFinite(d) ? d : 0); };
  a.preload = 'metadata';
  a.onloadedmetadata = () => done(a.duration);
  a.onerror = () => done(0);
  setTimeout(() => done(0), 5000);
  a.src = url;
});

// The id is a hash of the audio, so the same MP3 imported on PC and phone is the same song (no duplicates).
async function addAudio(blob, name = '', meta = null) {
  const buf = await blob.arrayBuffer();
  const id = await hashHex(buf);
  const old = S.songs.get(id);
  if (old) {
    if (meta?.liked && !old.liked) { old.liked = Number(meta.liked) || Date.now(); await put('songs', old); }
    return id;
  }
  const tags = readID3(buf);
  const base = name.replace(/\.[^.]+$/, ''), dash = base.indexOf(' - ');
  const file = new Blob([buf], { type: blob.type || 'audio/mpeg' });
  const song = {
    id, added: Date.now(), liked: 0,
    title: tags.title || (dash > 0 ? base.slice(dash + 3) : base) || 'Sans titre',
    artist: tags.artist || (dash > 0 ? base.slice(0, dash) : '') || 'Artiste inconnu',
    album: tags.album || '',
    cover: tags.cover || null,
    duration: await getDuration(file),
  };
  if (meta) { // values from a backup win (they may have been edited)
    for (const k of ['title', 'artist', 'album']) if (meta[k] != null) song[k] = String(meta[k]);
    for (const k of ['added', 'liked']) if (meta[k] != null) song[k] = Number(meta[k]) || 0;
  }
  await put('files', file, id); // audio first: never a song entry without its file
  await put('songs', song);
  S.songs.set(id, song);
  return id;
}

async function importFiles(list) {
  navigator.storage?.persist?.(); // ask the browser not to evict the library
  const files = [...list];
  let n = 0, skipped = 0;
  for (const f of files) {
    try {
      const bundle = await unpackBundle(f);
      if (bundle) await importBundle(bundle);
      else if (f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name)) {
        toast(`Import ${++n}/${files.length}…`);
        await addAudio(f, f.name);
      } else skipped++;
    } catch (e) { console.error(e); skipped++; }
  }
  refresh();
  toast(skipped ? `Terminé – ${skipped} fichier(s) ignoré(s)` : 'Import terminé ✓');
}

async function importBundle({ manifest: m, files }) {
  const idMap = {};
  for (let i = 0; i < files.length; i++) {
    toast(`Import de la sauvegarde ${i + 1}/${files.length}…`);
    idMap[m.songs[i].id] = await addAudio(files[i], '', m.songs[i]);
  }
  for (const p of m.playlists) {
    const ids = (Array.isArray(p.songIds) ? p.songIds : []).map(id => idMap[id]).filter(Boolean);
    const cur = S.playlists.get(String(p.id));
    await savePl(cur
      ? { ...cur, songIds: [...new Set([...cur.songIds, ...ids])] }
      : { id: String(p.id || crypto.randomUUID()), name: String(p.name || 'Playlist'), created: Number(p.created) || Date.now(), songIds: [...new Set(ids)] });
  }
}

async function exportSongs(ids, playlists, filename) {
  toast('Préparation de l’export…');
  const songs = [], blobs = [];
  for (const id of ids) {
    const s = S.songs.get(id), b = await get('files', id);
    if (!s || !b) continue;
    const { cover, ...meta } = s; // the cover is re-read from the MP3 on import
    songs.push({ ...meta, size: b.size, type: b.type });
    blobs.push(b);
  }
  const file = new File([packBundle({ app: 'melo', v: 1, songs, playlists }, blobs)], filename, { type: 'application/octet-stream' });
  toast('');
  // A fresh click is needed before sharing/downloading (browsers require a recent user gesture).
  menu(`Export prêt – ${songs.length} titres, ${(file.size / 1e6).toFixed(0)} Mo`, [
    navigator.canShare?.({ files: [file] }) && ['Partager (OneDrive, …)', () => navigator.share({ files: [file] }).catch(() => {})],
    ['Enregistrer le fichier', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }],
  ]);
}
const safeName = s => s.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'playlist';

// ---------- Library edits ----------
async function savePl(pl) { await put('playlists', pl); S.playlists.set(pl.id, pl); }

async function newPlaylist() {
  const name = prompt('Nom de la playlist', `Ma playlist n°${S.playlists.size + 1}`)?.trim();
  if (!name) return null;
  const pl = { id: crypto.randomUUID(), name, created: Date.now(), songIds: [] };
  await savePl(pl);
  renderSide();
  return pl;
}

async function addTo(pl, id) {
  if (pl.songIds.includes(id)) return toast('Déjà dans cette playlist');
  await savePl({ ...pl, songIds: [...pl.songIds, id] });
  toast(`Ajouté à « ${pl.name} »`);
  refresh();
}

async function toggleLike(id) {
  const s = S.songs.get(id);
  if (!s) return;
  s.liked = s.liked ? 0 : Date.now();
  await put('songs', s);
  refresh();
}

async function deleteSong(id) {
  await del('songs', id);
  await del('files', id);
  S.songs.delete(id);
  for (const pl of S.playlists.values()) if (pl.songIds.includes(id)) await savePl({ ...pl, songIds: pl.songIds.filter(x => x !== id) });
  refresh();
}

// ---------- Player ----------
const audio = new Audio();
const P = { queue: [], order: [], pos: -1, shuffle: false, repeat: 0 }; // repeat: 0 off, 1 all, 2 one
let curUrl;
const curId = () => P.queue[P.order[P.pos]];

function playList(ids, start = 0, shuffle = P.shuffle) {
  if (!ids.length) return;
  P.queue = ids.slice();
  P.shuffle = shuffle;
  if (start < 0) start = shuffle ? Math.floor(Math.random() * ids.length) : 0;
  makeOrder(start);
  load();
}

function makeOrder(first) {
  const o = P.queue.map((_, i) => i);
  if (P.shuffle) {
    o.splice(first, 1);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [o[i], o[j]] = [o[j], o[i]]; }
    o.unshift(first);
    P.pos = 0;
  } else P.pos = first;
  P.order = o;
}

async function load() {
  const id = curId(), blob = id && await get('files', id);
  if (!blob) { if (P.pos < P.order.length - 1) { P.pos++; load(); } return; } // song was deleted
  if (curUrl) URL.revokeObjectURL(curUrl);
  audio.src = curUrl = URL.createObjectURL(blob);
  audio.play().catch(() => {});
  updatePlayer();
}

function next(auto = false) {
  if (!P.order.length) return;
  if (auto && P.repeat === 2) { audio.currentTime = 0; audio.play(); return; }
  if (P.pos < P.order.length - 1) P.pos++;
  else if (P.repeat === 1) P.pos = 0;
  else return;
  load();
}

function prev() {
  if (audio.currentTime > 3 || P.pos <= 0) audio.currentTime = 0;
  else { P.pos--; load(); }
}

function playNext(id) {
  if (!P.order.length) return playList([id]);
  P.queue.push(id);
  P.order.splice(P.pos + 1, 0, P.queue.length - 1);
  toast('Sera lu ensuite');
}

const togglePlay = () => { if (!audio.src) return playList(S.shown, -1); audio.paused ? audio.play() : audio.pause(); };

function updatePlayer() {
  const s = S.songs.get(curId());
  $('#player').hidden = !s;
  $('#shuf').classList.toggle('on', P.shuffle);
  $('#rep').classList.toggle('on', P.repeat > 0);
  $('#rep').classList.toggle('one', P.repeat === 2);
  $('#play').innerHTML = icon(audio.paused ? 'play' : 'pause');
  document.querySelectorAll('.row').forEach(r => r.classList.toggle('playing', r.dataset.id === s?.id));
  if (!s) return;
  $('#npCover').outerHTML = coverHtml(s, 'cover" id="npCover');
  $('#npTitle').textContent = s.title;
  $('#npArtist').textContent = s.artist;
  $('#npLike').innerHTML = icon(s.liked ? 'heart' : 'heartO');
  $('#npLike').classList.toggle('on', !!s.liked);
  document.title = `${s.title} · ${s.artist}`;
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({
    title: s.title, artist: s.artist, album: s.album,
    artwork: s.cover ? [{ src: coverUrl(s), type: s.cover.type }] : [],
  });
}

audio.addEventListener('ended', () => next(true));
audio.addEventListener('play', updatePlayer);
audio.addEventListener('pause', updatePlayer);
audio.addEventListener('timeupdate', () => {
  $('#cur').textContent = fmt(audio.currentTime);
  $('#dur').textContent = fmt(audio.duration);
  if (audio.duration) $('#seek').value = audio.currentTime / audio.duration * 1000;
});
$('#seek').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; };
$('#vol').value = audio.volume = Number(localStorage.vol ?? 1);
$('#vol').oninput = e => { audio.volume = localStorage.vol = e.target.value; };
$('#play').onclick = togglePlay;
$('#next').onclick = () => next();
$('#prev').onclick = prev;
$('#shuf').onclick = () => { P.shuffle = !P.shuffle; if (P.order.length) makeOrder(P.order[P.pos]); updatePlayer(); };
$('#rep').onclick = () => { P.repeat = (P.repeat + 1) % 3; updatePlayer(); };
$('#npLike').onclick = e => { e.stopPropagation(); toggleLike(curId()); };
$('#np').onclick = () => document.body.classList.add('expanded');
$('#collapse').innerHTML = icon('down');
$('#collapse').onclick = () => document.body.classList.remove('expanded');
for (const [n, k] of [['shuf', 'shuffle'], ['prev', 'prev'], ['next', 'next'], ['rep', 'repeat']]) $('#' + n).innerHTML = icon(k);

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => audio.play());
  ms.setActionHandler('pause', () => audio.pause());
  ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('nexttrack', () => next());
  try { ms.setActionHandler('seekto', d => { audio.currentTime = d.seekTime; }); } catch { /* not supported */ }
}

// ---------- UI ----------
function menu(title, items) {
  const list = items.filter(Boolean), d = $('#dlg');
  d.innerHTML = `<div><h3>${esc(title)}</h3>${list.map((it, i) => `<button data-i="${i}">${esc(it[0])}</button>`).join('')}<button class="cancel">Annuler</button></div>`;
  d.onclick = e => {
    if (e.target === d || e.target.closest('.cancel')) return d.close();
    const b = e.target.closest('[data-i]');
    if (b) { d.close(); list[b.dataset.i][1](); }
  };
  d.showModal();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = !msg;
  clearTimeout(toast.t);
  if (msg && !msg.endsWith('…')) toast.t = setTimeout(() => { t.hidden = true; }, 2500);
}

const currentPl = () => S.view.startsWith('pl:') && S.playlists.get(S.view.slice(3));

function songMenu(id) {
  const s = S.songs.get(id), pl = currentPl();
  menu(`${s.title} – ${s.artist}`, [
    ['Lire ensuite', () => playNext(id)],
    ['Ajouter à une playlist', () => menu('Ajouter à…', [
      ['+ Nouvelle playlist', async () => { const p = await newPlaylist(); if (p) addTo(p, id); }],
      ...[...S.playlists.values()].map(p => [p.name, () => addTo(p, id)]),
    ])],
    pl && ['Retirer de cette playlist', async () => { await savePl({ ...pl, songIds: pl.songIds.filter(x => x !== id) }); refresh(); }],
    ['Modifier le titre / l’artiste', async () => {
      const title = prompt('Titre', s.title)?.trim(); if (!title) return;
      const artist = prompt('Artiste', s.artist)?.trim(); if (!artist) return;
      Object.assign(s, { title, artist });
      await put('songs', s);
      refresh();
    }],
    ['Supprimer de l’appareil', () => { if (confirm(`Supprimer « ${s.title} » de cet appareil ?`)) deleteSong(id); }],
  ]);
}

function render() {
  const v = S.view, pl = currentPl();
  let title, kind, ids;
  if (v === 'liked') {
    title = 'Titres likés'; kind = 'Playlist';
    ids = [...S.songs.values()].filter(s => s.liked).sort((a, b) => b.liked - a.liked).map(s => s.id);
  } else if (pl) {
    title = pl.name; kind = 'Playlist';
    ids = pl.songIds.filter(id => S.songs.has(id));
  } else {
    S.view = 'library'; title = 'Bibliothèque'; kind = 'Tous les titres';
    ids = [...S.songs.values()].sort((a, b) => b.added - a.added).map(s => s.id);
  }
  const q = S.query.toLowerCase();
  S.shown = q ? ids.filter(id => { const s = S.songs.get(id); return `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q); }) : ids;
  const coverSong = ids.map(id => S.songs.get(id)).find(s => s.cover);
  const total = ids.reduce((t, id) => t + (S.songs.get(id).duration || 0), 0);
  const btn = (act, label) => `<button class="btn" data-act="${act}">${label}</button>`;

  $('#view').innerHTML = `
    <section class="hero">
      ${v === 'liked' ? `<div class="cover big liked">${icon('heart')}</div>` : coverHtml(coverSong, 'cover big')}
      <div><small>${kind}</small><h1>${esc(title)}</h1><p>${ids.length} titres · ${Math.round(total / 60)} min</p></div>
    </section>
    <div class="actions">
      <button class="playbig" data-act="play" aria-label="Lire">${icon('play')}</button>
      <button class="icon" data-act="shuffle" aria-label="Lecture aléatoire">${icon('shuffle')}</button>
      ${pl ? btn('rename', 'Renommer') + btn('export-pl', 'Exporter') + btn('delete-pl', 'Supprimer') : ''}
      ${v === 'library' ? btn('import', 'Importer') : ''}
    </div>
    ${S.shown.map((id, i) => {
      const s = S.songs.get(id);
      return `<div class="row${id === curId() ? ' playing' : ''}" data-id="${id}" data-i="${i}" tabindex="0">
        <span class="num">${i + 1}</span>${coverHtml(s)}
        <div class="meta"><div class="title">${esc(s.title)}</div><div class="sub">${esc(s.artist)}</div></div>
        <span class="album">${esc(s.album)}</span>
        <button class="icon${s.liked ? ' on' : ''}" data-act="like" aria-label="J'aime">${icon(s.liked ? 'heart' : 'heartO')}</button>
        <span class="dur">${fmt(s.duration)}</span>
        <button class="icon" data-act="more" aria-label="Plus d'options">${icon('more')}</button>
      </div>`;
    }).join('') || `<p class="empty">${q ? 'Aucun résultat.' : v === 'library'
      ? 'Ta bibliothèque est vide.<br><br><button class="btn" data-act="import">Importer des MP3 ou une sauvegarde</button>'
      : 'Aucun titre pour l’instant.'}</p>`}`;
}

function renderSide() {
  $('#plList').innerHTML = [...S.playlists.values()].sort((a, b) => a.created - b.created)
    .map(p => `<button data-view="pl:${esc(p.id)}">${esc(p.name)}<small>${p.songIds.length} titres</small></button>`).join('');
  document.querySelectorAll('#side [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  navigator.storage?.estimate?.().then(e => { $('#usage').textContent = `${S.songs.size} titres · ${(e.usage / 1e9).toFixed(2)} Go utilisés`; });
}

function refresh() { render(); renderSide(); updatePlayer(); }

function go(view) {
  S.view = view; S.query = ''; $('#search').value = '';
  document.body.classList.remove('nav-open');
  refresh();
  $('main').scrollTop = 0;
}

$('#view').onclick = async e => {
  const act = e.target.closest('[data-act]')?.dataset.act, row = e.target.closest('.row'), id = row?.dataset.id, pl = currentPl();
  if (act === 'play') return playList(S.shown, -1);
  if (act === 'shuffle') return playList(S.shown, -1, true);
  if (act === 'import') return $('#fileIn').click();
  if (act === 'like') return toggleLike(id);
  if (act === 'more') return songMenu(id);
  if (act === 'rename') { const name = prompt('Nouveau nom', pl.name)?.trim(); if (name) { await savePl({ ...pl, name }); refresh(); } return; }
  if (act === 'export-pl') return exportSongs(pl.songIds, [pl], `melo-${safeName(pl.name)}.melo`);
  if (act === 'delete-pl') { if (confirm(`Supprimer la playlist « ${pl.name} » ? (les titres restent dans la bibliothèque)`)) { await del('playlists', pl.id); S.playlists.delete(pl.id); go('library'); } return; }
  if (row) playList(S.shown, +row.dataset.i);
};
$('#view').onkeydown = e => { if (e.key === 'Enter' && e.target.classList.contains('row')) playList(S.shown, +e.target.dataset.i); };
$('#side').onclick = e => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
$('#newPl').onclick = async () => { const pl = await newPlaylist(); if (pl) go('pl:' + pl.id); };
$('#importBtn').onclick = () => $('#fileIn').click();
$('#fileIn').onchange = e => { importFiles(e.target.files); e.target.value = ''; };
$('#exportBtn').onclick = () => exportSongs([...S.songs.keys()], [...S.playlists.values()], `melo-sauvegarde-${new Date().toISOString().slice(0, 10)}.melo`);
$('#search').oninput = e => { S.query = e.target.value; render(); };
$('#menuBtn').onclick = e => { e.stopPropagation(); document.body.classList.toggle('nav-open'); };
$('main').addEventListener('click', () => document.body.classList.remove('nav-open'));
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); importFiles(e.dataTransfer.files); });
addEventListener('keydown', e => {
  if (e.code === 'Space' && !e.target.closest('input, textarea, button, dialog')) { e.preventDefault(); togglePlay(); }
});

// Link -> MP3, done by convert_server.py running on this PC (see README).
const CONVERTER = 'http://127.0.0.1:8777';
$('#linkForm').onsubmit = async e => {
  e.preventDefault();
  const input = $('#linkUrl'), url = input.value.trim();
  toast('Conversion en cours…');
  try {
    const r = await fetch(CONVERTER + '/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    const name = decodeURIComponent(r.headers.get('X-Filename') || 'son.mp3');
    navigator.storage?.persist?.();
    await addAudio(new File([await r.blob()], name, { type: 'audio/mpeg' }), name);
    input.value = '';
    go('library');
    toast('Ajouté à la bibliothèque ✓');
  } catch (err) {
    toast(err instanceof TypeError ? 'Convertisseur introuvable : lance convertisseur.bat sur ton PC' : 'Échec : ' + err.message);
  }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

for (const s of await getAll('songs')) S.songs.set(s.id, s);
for (const p of await getAll('playlists')) S.playlists.set(p.id, p);
refresh();
