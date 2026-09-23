'use strict';
// Reusable input for future reprocessing. Verify bytes before interpreting any chunk.
const {createReadStream,statSync} = require('node:fs');
const {createHash} = require('node:crypto');
const {createGunzip} = require('node:zlib');
const {createInterface} = require('node:readline');
async function* readJournal(manifest, localFile) {
  if(manifest.version!==1 || manifest.complete!==true || !Array.isArray(manifest.chunks))throw Error('incomplete_journal');
  let responses=0,battles=0;
  for(const chunk of manifest.chunks){
    const file=localFile(chunk.key),hash=createHash('sha256');
    if(statSync(file).size!==chunk.bytes)throw Error('journal_size_mismatch');
    for await(const bytes of createReadStream(file))hash.update(bytes);
    if(hash.digest('hex')!==chunk.sha256)throw Error('journal_checksum_mismatch');
    const input=createReadStream(file),gzip=createGunzip();
    input.on('error',e=>gzip.destroy(e));input.pipe(gzip);
    const lines=createInterface({input:gzip,crlfDelay:Infinity});
    try{for await(const line of lines){
      if(!line)continue;
      const row=JSON.parse(line);if(!Array.isArray(row.battles))throw Error('invalid_journal_row');
      responses++;battles+=row.battles.length;yield row;
    }}finally{lines.close();gzip.destroy();input.destroy();}
  }
  if(responses!==manifest.responses||battles!==manifest.battleObservations)throw Error('journal_count_mismatch');
}
module.exports={readJournal};
