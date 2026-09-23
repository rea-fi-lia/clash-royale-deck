'use strict';
// Request scheduling only. The API request budget and rate limiter remain independent of storage.
function seedBand(seed) { return Number.isFinite(seed?.tr) && seed.tr >= 0 ? String(Math.floor(Math.min(seed.tr,14000)/300)*300) : 'unknown'; }
function revisitMs(seed, now) {
  if (!seed.lastOk) return seed.lastStatus === 404 ? 24*3600000 : 3600000;
  const age = now - (seed.lastBattle || 0);
  return age <= 6*3600000 ? 3600000 : age <= 86400000 ? 3*3600000 : age <= 7*86400000 ? 12*3600000 : 24*3600000;
}
function selectSeeds(seeds, exclude, budget, now) {
  const bands = {}, eligible = {}, selected = new Set();
  for (const [tag, seed] of Object.entries(seeds)) {
    if (exclude[tag]) continue;
    const b = seedBand(seed); (bands[b] ||= []).push(tag);
    if (!seed.lastFetch || now-seed.lastFetch >= revisitMs(seed,now)) (eligible[b] ||= []).push(tag);
  }
  const older = (a,b) => (seeds[a].lastFetch||0)-(seeds[b].lastFetch||0) || a.localeCompare(b);
  for (const arr of Object.values(bands)) arr.sort(older);
  for (const arr of Object.values(eligible)) arr.sort(older);
  function take(map, limit) {
    const keys = Object.keys(map).sort((a,b)=>(Number(a)||0)-(Number(b)||0));
    for (let i=0; selected.size<limit; i++) {
      let more=false;
      for(const b of keys) { const tag=map[b][i]; if(tag){more=true;selected.add(tag);} if(selected.size>=limit)break; }
      if(!more)break;
    }
  }
  // Most slots serve due players. The remaining slots explore the longest-unchecked candidates,
  // so an inactive player who starts playing again can be discovered without permanent exclusion.
  take(eligible,Math.floor(budget*0.8)); take(bands,budget);
  const picked=[...selected], counts={}; for(const tag of picked){const b=seedBand(seeds[tag]);counts[b]=(counts[b]||0)+1;}
  return {picked, candidates:Object.fromEntries(Object.entries(bands).map(([k,v])=>[k,v.length])), selected:counts, due:Object.values(eligible).reduce((n,v)=>n+v.length,0)};
}
function noteAttempt(seeds, tags, now) { for(const raw of tags){const seed=seeds[String(raw).replace(/^#/,'')];if(seed)seed.lastFetch=now;} }
function retainSeeds(seeds,budget) {
  const bands={}; for(const [tag,seed] of Object.entries(seeds))(bands[seedBand(seed)]||=[]).push(tag);
  for(const tags of Object.values(bands))tags.sort((a,b)=>(seeds[b].lastSeen||0)-(seeds[a].lastSeen||0)||a.localeCompare(b));
  const out={},groups=Object.values(bands);let count=0;
  for(let i=0;count<budget;i++){let more=false;for(const tags of groups){if(tags[i]){out[tags[i]]=seeds[tags[i]];count++;more=true;}if(count>=budget)break;}if(!more)break;}
  return out;
}
module.exports={seedBand,revisitMs,selectSeeds,noteAttempt,retainSeeds};
