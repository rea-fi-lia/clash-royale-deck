'use strict';
// Lossless API-response journal. Selection/analysis must never be the only retained input.
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');
const { createHash } = require('node:crypto');
class BattleLogJournal {
  constructor({ chunkBytes = 16 * 1024 * 1024, source = {} } = {}) {
    this.chunkBytes = chunkBytes; this.source = source; this.files = []; this.responses = 0; this.battles = 0;
  }
  add({ tag, population, fetchedAt, battles }) {
    if (!Array.isArray(battles)) throw Error('invalid_battlelog_response');
    this.dir ||= fs.mkdtempSync(join(tmpdir(), 'crdb-api-journal-'));
    const line = JSON.stringify({ tag, population, fetchedAt, battles }) + '\n';
    let part = this.files.at(-1);
    if (!part || part.bytes >= this.chunkBytes) { part = { path: join(this.dir, `${this.files.length}.jsonl`), bytes: 0 }; this.files.push(part); }
    fs.appendFileSync(part.path, line, { mode: 0o600 }); part.bytes += Buffer.byteLength(line);
    this.responses++; this.battles += battles.length;
  }
  async flush({ prefix, putFile, putManifest }) {
    const chunks = [];
    for (const [index, part] of this.files.entries()) {
      const path = part.path + '.gz';
      await pipeline(fs.createReadStream(part.path), createGzip(), fs.createWriteStream(path, { mode: 0o600 }));
      const hash = createHash('sha256'); for await (const bytes of fs.createReadStream(path)) hash.update(bytes);
      const chunk = { key: `${prefix}/part-${index}.jsonl.gz`, sha256: hash.digest('hex'), bytes: fs.statSync(path).size, uncompressedBytes: part.bytes };
      if (await putFile(chunk.key, path, chunk) === false) throw Error('battlelog_journal_upload_failed');
      chunks.push(chunk);
    }
    const manifest = { version: 1, source: this.source, responses: this.responses, battleObservations: this.battles, chunks, complete: true };
    if (await putManifest(`${prefix}/manifest.json`, manifest) === false) throw Error('battlelog_manifest_upload_failed');
    if (this.dir) fs.rmSync(this.dir, { recursive: true });
    this.files = []; this.dir = null;
    return { key: `${prefix}/manifest.json`, responses: this.responses, battleObservations: this.battles, bytes: chunks.reduce((n, c) => n + c.bytes, 0) };
  }
}
module.exports = { BattleLogJournal };
