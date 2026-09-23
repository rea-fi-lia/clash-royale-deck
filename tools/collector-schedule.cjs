'use strict';
// Request scheduling only. The API request budget and rate limiter remain independent of storage.
function seedBand(seed) { return Number.isFinite(seed?.tr) && seed.tr >= 0 ? String(Math.floor(Math.min(seed.tr,14000)/300)*300) : 'unknown'; }
function revisitMs(seed, now) {
  if (!seed.lastOk) return seed.lastStatus === 404 ? 24*3600000 : 3600000;
  if (seed.logWindowMs > 0 && seed.logWindowMs < 6*3600000) return Math.max(3600000, seed.logWindowMs * 0.5);
  const age = now - (seed.lastBattle || 0);
  return age <= 6*3600000 ? 3600000 : age <= 86400000 ? 3*3600000 : age <= 7*86400000 ? 12*3600000 : 24*3600000;
}
function selectSeeds(seeds, exclude, budget, now, plan = null) {
  const validPlan = plan?.version === 1 && Date.parse(plan.updated) <= now && Date.parse(plan.expiresAt) > now;
  const weights = validPlan ? plan.weights || {} : {};
  const bands = {}, eligible = {}, selected = new Set(), counts = {};
  for (const [tag, seed] of Object.entries(seeds)) {
    if (exclude[tag]) continue;
    const b = seedBand(seed); (bands[b] ||= []).push(tag);
    if (!seed.lastFetch || now-seed.lastFetch >= revisitMs(seed,now)) (eligible[b] ||= []).push(tag);
  }
  const older = (a,b) => (seeds[a].lastFetch||0)-(seeds[b].lastFetch||0) || a.localeCompare(b);
  const overdue = tag => seeds[tag].lastFetch ? (now-seeds[tag].lastFetch)/revisitMs(seeds[tag],now) : 1;
  for (const arr of Object.values(bands)) arr.sort(older);
  for (const arr of Object.values(eligible)) arr.sort((a,b)=>overdue(b)-overdue(a)||older(a,b));
  function take(map, limit, weighted) {
    const keys = Object.keys(map).sort((a,b)=>(Number(a)||0)-(Number(b)||0)), pos = {}, taken = {};
    while (selected.size < limit) {
      let best = null, score = Infinity;
      for (const b of keys) {
        pos[b] ||= 0;
        while (pos[b] < map[b].length && selected.has(map[b][pos[b]])) pos[b]++;
        if (pos[b] >= map[b].length) continue;
        const w = weighted && Number.isFinite(weights[b]) ? Math.max(0.5,Math.min(3,weights[b])) : 1;
        const next = ((taken[b]||0)+1)/w;
        if (next < score) { score=next; best=b; }
      }
      if (best === null) break;
      selected.add(map[best][pos[best]++]); taken[best]=(taken[best]||0)+1;
    }
  }
  // Reserve exploration first; changing feedback can never starve a band permanently.
  take(bands, Math.floor(budget*0.2), false);
  take(eligible, budget, true);
  take(bands, budget, false);
  const picked=[...selected]; for(const tag of picked){const b=seedBand(seeds[tag]);counts[b]=(counts[b]||0)+1;}
  return {picked, planUpdated:validPlan?plan.updated:null, candidates:Object.fromEntries(Object.entries(bands).map(([k,v])=>[k,v.length])), selected:counts, due:Object.values(eligible).reduce((n,v)=>n+v.length,0)};
}
function noteAttempt(seeds, tags, now) { for(const raw of tags){const seed=seeds[String(raw).replace(/^#/,'')];if(seed)seed.lastFetch=now;} }
function retainSeeds(seeds,budget) {
  const bands={}; for(const [tag,seed] of Object.entries(seeds))(bands[seedBand(seed)]||=[]).push(tag);
  for(const tags of Object.values(bands))tags.sort((a,b)=>(seeds[b].lastSeen||0)-(seeds[a].lastSeen||0)||a.localeCompare(b));
  const out={},groups=Object.values(bands);let count=0;
  for(let i=0;count<budget;i++){let more=false;for(const tags of groups){if(tags[i]){out[tags[i]]=seeds[tags[i]];count++;more=true;}if(count>=budget)break;}if(!more)break;}
  return out;
}
function retainBookmarks(bookmarks,seeds,tracked) {
  return Object.fromEntries(Object.entries(bookmarks).filter(([tag])=>{const key=tag.replace(/^#/,'').toUpperCase();return seeds[key]||tracked[key];}));
}
module.exports={seedBand,revisitMs,selectSeeds,noteAttempt,retainSeeds,retainBookmarks};
