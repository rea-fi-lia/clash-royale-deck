// Facts reviewed against Supercell's announcement. Fetch freshness != balance freshness.
const {digest} = require('./card-catalogue.cjs');
const reference = require('../catalogue/balance-checks.json');
const NEWS = 'https://supercell.com/en/games/clashroyale/blog/';
function articleDigest(html) {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  const page = JSON.parse(raw || '{}').props?.pageProps;
  if (!Array.isArray(page?.bodyCollection) || !page.title) throw Error('Official article structure changed');
  // Ignore navigation, tracking and image URLs; a new paragraph/value requires review.
  const texts = value => {
    if (!value || typeof value !== 'object') return [];
    if (value.nodeType === 'text') return [value.value];
    return Object.values(value).flatMap(v => Array.isArray(v) ? v.flatMap(texts) : texts(v));
  };
  return digest([page.title, ...page.bodyCollection.map(b => [b.title || '', ...texts(b.text), ...texts(b.featureText)])]);
}
async function checkOfficialSource(fetcher = fetch, ref = reference) {
  const checkedAt = new Date().toISOString();
  try {
    const read = async url => {
      const r = await fetcher(url, {signal:AbortSignal.timeout(15000)});
      if (!r.ok) throw Error('Official source HTTP '+r.status);
      const body = await r.text();if(body.length>2000000) throw Error('Official page too large');return body;
    };
    const news = await read(NEWS);
    const links = [...news.matchAll(/href="([^"#]+)"/g)].map(m=>new URL(m[1],NEWS)).filter(u=>u.origin==='https://supercell.com' && u.pathname.startsWith('/en/games/clashroyale/blog/release-notes/') && /balance/i.test(u.pathname) && !/merge/i.test(u.pathname));
    const latest = links[0]?.href.replace(/\/$/,'');
    if (!latest) throw Error('No official balance article found');
    if (latest !== ref.source.replace(/\/$/,'')) return {status:'review-required',checkedAt,source:latest,reason:'New official balance article'};
    const fingerprint = articleDigest(await read(ref.source));
    return {status:fingerprint===ref.articleSha256?'reviewed':'review-required',checkedAt,source:ref.source,articleSha256:fingerprint};
  } catch(e) {return {status:'unavailable',checkedAt,source:ref.source,error:String(e.message).slice(0,180)};}
}
function actualValue(card, check) {
  const target = check.form==='n' ? card : card.formStats?.[check.form];
  const table = check.level ? target?.levels?.[String(check.level)] : target?.attrs;
  if ((check.requiredKeys || []).some(k => table?.[k] == null)) return null;
  const raw = table?.[check.key];
  if (raw == null) return null;
  if (typeof check.expected === 'string') return String(raw).trim();
  const text = String(raw).replace(/,/g,'').trim();
  // Do not guess a scalar from a multi-stage/range/object stat.
  if(!/^-?\d+(?:\.\d+)?(?:\s*(?:s|sec|seconds?|tiles))?$/.test(text)) return null;
  return parseFloat(text);
}
function auditBalances(data, official, ref = reference) {
  let matched=0,mismatched=0,unverified=0;
  for(const card of data.cards) {
    const checks=ref.checks.filter(c=>c.slug===card.slug).map(check=>{
      const actual=actualValue(card,check);
      const status=actual===null?'unverified':actual===check.expected?'matched':'mismatch';
      if(status==='matched') matched++;else if(status==='mismatch') mismatched++;else unverified++;
      return {...check,actual,status};
    });
    if(checks.length) card.balanceVerification={source:ref.source,reviewedAt:ref.reviewedAt,checkedAt:official.checkedAt,status:checks.some(c=>c.status==='mismatch')?'mismatch':checks.some(c=>c.status==='unverified')?'unverified':'matched',checks};
    else delete card.balanceVerification;
  }
  data.balanceVerification={official,total:ref.checks.length,matched,mismatched,unverified,latestEffectiveAt:ref.latestEffectiveAt,status:official.status==='reviewed'&&!mismatched&&!unverified?'matched':'needs-review'};
  return data.balanceVerification;
}
module.exports={articleDigest,checkOfficialSource,actualValue,auditBalances};
