// Preserve API observations whose new card/form cannot yet be interpreted.
// Disk chunks bound memory, never the number of retained observations.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
class UnmappedCardStore {
  constructor(){this.dir=null;this.count=0;}
  add(row){
    this.dir ||= fs.mkdtempSync(path.join(os.tmpdir(),'crdb-unmapped-'));
    const file=path.join(this.dir,Math.floor(this.count/250)+'.jsonl');
    fs.appendFileSync(file,JSON.stringify(row)+'\n',{mode:0o600});this.count++;
  }
  async flush(write){
    if(!this.dir)return;
    for(let part=0;part<Math.ceil(this.count/250);part++){
      const file=path.join(this.dir,part+'.jsonl');
      const observations=fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
      if(await write(part,observations)===false)throw Error('Unmapped observations were not archived');
    }
    fs.rmSync(this.dir,{recursive:true});this.dir=null;
  }
}
module.exports={UnmappedCardStore};
