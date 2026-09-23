'use strict';
// Disk-backed event transport/deduplication. No ranking or scoring formulas live here.
const { DatabaseSync } = require('node:sqlite');
const { createReadStream, createWriteStream, mkdtempSync, rmSync, statSync, chmodSync, renameSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');
const { createHash } = require('node:crypto');

// Incremental parser for a top-level JSON array member. Braces/quotes and UTF-8 may cross chunks.
async function* jsonItems(body, field = 'events') {
  const decoder = new TextDecoder();
  let buffer = '', offset = 0, start = -1, depth = 0, quoted = false, escaped = false, started = false;
  for await (const value of body) {
    buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
    if (!started) {
      const match = new RegExp('"' + field + '"\\s*:\\s*\\[').exec(buffer);
      if (!match) { if (buffer.length > 65536) throw new Error('event_array_missing'); continue; }
      buffer = buffer.slice(match.index + match[0].length); started = true;
    }
    for (; offset < buffer.length; offset++) {
      const c = buffer[offset];
      if (start < 0) {
        if (c === ']') return;
        if (c === '{') { start = offset; depth = 1; quoted = false; escaped = false; }
        else if (!/[\s,]/.test(c)) throw new Error('invalid_event_array');
        continue;
      }
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { yield JSON.parse(buffer.slice(start, offset + 1)); start = -1; }
    }
    if (start < 0) { buffer = ''; offset = 0; }
    else { buffer = buffer.slice(start); offset -= start; start = 0; if (buffer.length > 1024 * 1024) throw new Error('event_too_large'); }
  }
  throw new Error('truncated_event_array');
}

const EVENT_SCHEMA = 'CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY NOT NULL, t INTEGER NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sources(key TEXT PRIMARY KEY, etag TEXT NOT NULL) WITHOUT ROWID;';
function openEventDatabase(path) {
  let db = new DatabaseSync(path);
  // A random hash primary key in a WITHOUT ROWID table scatters the entire payload.
  // Keep payloads in append order and the much smaller unique-key index separately.
  if (/WITHOUT ROWID/i.test(db.prepare("SELECT sql FROM sqlite_master WHERE name='events'").get()?.sql || '')) {
    const nextPath = path + '.next'; let next;
    try {
      next = new DatabaseSync(nextPath); chmodSync(nextPath, 0o600);
      next.exec('PRAGMA cache_size=-131072; PRAGMA temp_store=FILE;' + EVENT_SCHEMA);
      next.prepare('ATTACH DATABASE ? AS previous').run(path);
      next.exec('BEGIN; INSERT INTO events SELECT id,t,payload FROM previous.events; INSERT INTO sources SELECT key,etag FROM previous.sources; COMMIT; DETACH DATABASE previous;');
      next.close(); next = null; db.close(); db = null;
      // Replace only after the complete copy closes successfully. The R2 snapshot stays intact.
      renameSync(nextPath, path); db = new DatabaseSync(path);
    } catch (err) { if (next) next.close(); if (db) db.close(); rmSync(nextPath,{force:true}); throw err; }
  }
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=10000; PRAGMA cache_size=-131072; PRAGMA temp_store=FILE;');
  db.exec(EVENT_SCHEMA + 'CREATE INDEX IF NOT EXISTS events_t ON events(t);');
  return db;
}

class EventStore {
  constructor(path, { identity, time, cutoff, through = Date.now(), project = item => item }) {
    this.db = openEventDatabase(path); chmodSync(path, 0o600);
    this.db.prepare('DELETE FROM events WHERE t < ? OR t > ?').run(cutoff, through);
    this.identity = identity; this.time = time; this.cutoff = cutoff; this.through = through;
    this.project = project;
    this.put = this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)');
    // Retain the statement while its iterator is active (Node 22.15 may otherwise finalize it during GC).
    this.scan = this.db.prepare('SELECT t, payload FROM events');
  }
  async ingest(items, source) {
    let observed = 0, added = 0, excluded = 0;
    this.db.exec('BEGIN');
    try {
      for await (const item of items) {
        const t = this.time(item), id = this.identity(item);
        if (!id || !Number.isFinite(t) || t < this.cutoff || t > this.through) { excluded++; continue; }
        observed++; added += Number(this.put.run(id, t, JSON.stringify(this.project(item))).changes);
        if (observed % 2000 === 0) { this.db.exec('COMMIT; BEGIN'); }
      }
      if (source) this.db.prepare('INSERT OR REPLACE INTO sources VALUES(?,?)').run(source.key, source.etag || '');
      this.db.exec('COMMIT');
    } catch (err) { this.db.exec('ROLLBACK'); throw err; }
    return { observed, added, duplicates: observed - added, excluded };
  }
  hasSource(source) { return this.db.prepare('SELECT etag FROM sources WHERE key=?').get(source.key)?.etag === (source.etag || ''); }
  count() { return this.db.prepare('SELECT count(*) AS n FROM events').get().n; }
  *timedEvents() { for (const row of this.scan.iterate()) yield {time: row.t, event: JSON.parse(row.payload)}; }
  *events() { for (const row of this.scan.iterate()) yield JSON.parse(row.payload); }
  close() { this.db.close(); }
}

function xmlText(s) { return s.replace(/&(?:amp|lt|gt|quot|apos);/g, x => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[x]); }
function listXml(xml) {
  if (!/<ListBucketResult[\s>]/.test(xml)) throw new Error('invalid_object_listing');
  const text = (s, tag) => xmlText(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(s)?.[1] || '');
  return { objects: [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(m => ({key:text(m[1],'Key'), etag:text(m[1],'ETag'), size:Number(text(m[1],'Size'))})), cursor:text(xml,'NextContinuationToken'), truncated:text(xml,'IsTruncated') === 'true' };
}
async function fileDigest(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }

async function openRollingStore({ request, prefix, snapshot, legacy, identity, time, project, cutoff, through, budgetMs = 240000, onProgress = () => {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'crdb-events-')), dbPath = join(dir, 'events.sqlite');
  let store;
  try {
    const restored = await request('GET', snapshot);
    if (restored.status === 200) await pipeline(restored.body, createGunzip(), createWriteStream(dbPath, {mode:0o600}));
    else if (restored.status !== 404) throw new Error('event_snapshot_read_' + restored.status);
    store = new EventStore(dbPath, {identity, time, project, cutoff, through});
    if (restored.status === 404 && legacy) {
      const prior = await request('GET', legacy);
      if (prior.status === 200) await store.ingest(jsonItems(prior.body));
      else if (prior.status !== 404) throw new Error('event_legacy_read_' + prior.status);
    }
    return {
      store,
      async backfill() {
        const all = [], firstDay = new Date(cutoff).toISOString().slice(0,10), lastDay = new Date(through).toISOString().slice(0,10);
        for (let day = Date.parse(firstDay); day <= Date.parse(lastDay); day += 86400000) {
          const dayPrefix = prefix + new Date(day).toISOString().slice(0,10) + '/'; let cursor;
          do {
            const response = await request('GET', '', null, null, {query:{'list-type':'2',prefix:dayPrefix,'max-keys':'1000',...(cursor?{'continuation-token':cursor}:{})}});
            if (response.status !== 200) throw new Error('archive_list_' + response.status);
            const page = listXml(await response.text());
            all.push(...page.objects.filter(o => o.key.startsWith(dayPrefix) && /\/run-[^/]+\.json$/.test(o.key)));
            if (page.truncated && !page.cursor) throw new Error('archive_list_cursor_missing');
            cursor = page.truncated ? page.cursor : null;
          } while (cursor);
        }
        const pending = all.filter(o => !store.hasSource(o)).sort((a,b) => b.key.localeCompare(a.key));
        const start = Date.now(); let completed = 0, added = 0;
        for (const source of pending) {
          if (completed && Date.now() - start >= budgetMs) break;
          const response = await request('GET', source.key);
          if (response.status !== 200) throw new Error('archive_read_' + response.status);
          const result = await store.ingest(jsonItems(response.body), source);
          added += result.added; completed++;
          onProgress({completed, pending:pending.length-completed, added, count:store.count()});
        }
        return {state:completed===pending.length?'complete':'backfilling', archives:all.length, processed:all.length-pending.length+completed, remaining:pending.length-completed, added, sourceWindowStart:new Date(cutoff).toISOString()};
      },
      async save() {
        store.close(); store = null;
        const file = join(dir,'events.sqlite.gz');
        await pipeline(createReadStream(dbPath),createGzip({level:1}),createWriteStream(file,{mode:0o600}));
        const response = await request('PUT',snapshot,null,'application/gzip',{file,payloadHash:await fileDigest(file),length:statSync(file).size});
        if (response.status < 200 || response.status >= 300) throw new Error('event_snapshot_write_' + response.status);
        return statSync(file).size;
      },
      cleanup() { if (store) store.close(); store = null; rmSync(dir,{recursive:true,force:true}); }
    };
  } catch (err) { if (store) store.close(); rmSync(dir,{recursive:true,force:true}); throw err; }
}
module.exports = { jsonItems, EventStore, listXml, openRollingStore };
