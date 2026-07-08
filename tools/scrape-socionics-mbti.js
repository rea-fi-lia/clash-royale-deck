#!/usr/bin/env node
/*
 * socionics.or.jp の公開 sitemap / type pages から、MBTI入力をデッキアシストへ
 * 裏側で変換するための軽量JSONを生成する。
 *
 * 方針:
 * - robots.txt で許可されている公開ページのみ取得する。
 * - 本文の長文転載は禁止。保存するのは URL / title / meta の短い識別情報と、
 *   タイプ記号から導出したゲーム用の軸だけ。
 * - ユーザーには Socionics を見せない。MBTI -> internalProfile の変換にだけ使う。
 *
 * 例:
 *   node tools/scrape-socionics-mbti.js --out data/assist-mbti-socionics-v1.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const BASE = 'https://www.socionics.or.jp';
const SITEMAP = BASE + '/sitemap.xml';
const DEFAULT_OUT = path.join(os.tmpdir(), 'assist-mbti-socionics-v1.json');
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'crdb-data-private';
const R2_PRIVATE_PREFIX = process.env.R2_PRIVATE_PREFIX || 'private/';
const R2_CONFIGURED = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
const TYPE_RE = /\/(ILE|SEI|ESE|LII|EIE|LSI|SLE|IEI|SEE|ILI|LIE|ESI|LSE|EII|IEE|SLI)_[DQ]\/?$/;
const AXIS_KEYS = ['weight', 'tempo', 'style', 'thrill', 'risk', 'complexity'];

// 一般的な Socionics 16タイプとMBTI表記の実務上の対応。
// J/P反転は「内向タイプは最後の文字が反転する」運用差を吸収するためのもの。
const SOCIONICS_TO_MBTI = {
  ILE: 'ENTP', SEI: 'ISFP', ESE: 'ESFJ', LII: 'INTJ',
  EIE: 'ENFJ', LSI: 'ISTJ', SLE: 'ESTP', IEI: 'INFP',
  SEE: 'ESFP', ILI: 'INTP', LIE: 'ENTJ', ESI: 'ISFJ',
  LSE: 'ESTJ', EII: 'INFJ', IEE: 'ENFP', SLI: 'ISTP'
};
const MBTI_TO_SOCIONICS = Object.fromEntries(Object.entries(SOCIONICS_TO_MBTI).map(([soc, mbti]) => [mbti, soc]));

const SOCIONICS_SIGNAL = {
  ILE: { weight: -0.20, tempo: 0.40, style: 0.45, thrill: 0.55, risk: 0.45, complexity: 0.70 },
  SEI: { weight: -0.25, tempo: 0.10, style: -0.55, thrill: -0.20, risk: -0.35, complexity: -0.20 },
  ESE: { weight: -0.05, tempo: 0.35, style: 0.35, thrill: 0.35, risk: 0.05, complexity: -0.10 },
  LII: { weight: 0.05, tempo: -0.05, style: -0.35, thrill: -0.10, risk: -0.30, complexity: 0.65 },
  EIE: { weight: 0.10, tempo: 0.15, style: 0.50, thrill: 0.60, risk: 0.35, complexity: 0.35 },
  LSI: { weight: 0.25, tempo: -0.20, style: -0.50, thrill: -0.30, risk: -0.60, complexity: 0.10 },
  SLE: { weight: 0.20, tempo: 0.30, style: 0.70, thrill: 0.55, risk: 0.45, complexity: 0.05 },
  IEI: { weight: -0.05, tempo: -0.10, style: -0.25, thrill: 0.25, risk: 0.15, complexity: 0.45 },
  SEE: { weight: 0.05, tempo: 0.45, style: 0.70, thrill: 0.60, risk: 0.45, complexity: -0.10 },
  ILI: { weight: 0.20, tempo: -0.35, style: -0.45, thrill: -0.20, risk: -0.25, complexity: 0.70 },
  LIE: { weight: 0.20, tempo: 0.25, style: 0.45, thrill: 0.25, risk: 0.10, complexity: 0.45 },
  ESI: { weight: 0.10, tempo: -0.20, style: -0.55, thrill: -0.20, risk: -0.55, complexity: 0.05 },
  LSE: { weight: 0.15, tempo: 0.10, style: 0.10, thrill: -0.15, risk: -0.45, complexity: -0.20 },
  EII: { weight: -0.10, tempo: -0.15, style: -0.45, thrill: -0.05, risk: -0.35, complexity: 0.35 },
  IEE: { weight: -0.20, tempo: 0.35, style: 0.35, thrill: 0.55, risk: 0.35, complexity: 0.50 },
  SLI: { weight: 0.05, tempo: -0.05, style: -0.45, thrill: -0.35, risk: -0.40, complexity: -0.10 }
};
const VARIANT_SIGNAL = {
  Q: { complexity: 0.16, tempo: -0.04, risk: -0.04 },
  D: { style: 0.16, tempo: 0.08, thrill: 0.10, risk: 0.06 }
};

function argValue(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
function hasArg(name) { return process.argv.includes(name); }
function clamp1(v) { return v < -1 ? -1 : v > 1 ? 1 : +v.toFixed(3); }
function htmlUnescape(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function stripTags(s) { return htmlUnescape(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function shortText(s, max) {
  s = stripTags(s).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}
function sha256(s) { return crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function titleOf(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? shortText(m[1], 120) : '';
}
function metaOf(html, key) {
  const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${safeKey}["'][^>]*>`, 'i');
  const tag = String(html || '').match(re);
  if (!tag) return '';
  const c = tag[0].match(/content=["']([\s\S]*?)["']/i);
  return c ? shortText(c[1], 180) : '';
}
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'CRDeckBuildersBot/1.0 (+https://crdeckbuilders.com/)' } });
  if (!res.ok) throw new Error('GET ' + url + ' -> ' + res.status);
  return await res.text();
}
function r2ObjectKey(target) {
  let prefix = String(R2_PRIVATE_PREFIX || '').replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return prefix + String(target || '').replace(/^\/+/, '');
}
function r2IsoStamp() { return new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); }
function r2Sha256Hex(value) { return crypto.createHash('sha256').update(value || '').digest('hex'); }
function r2Hmac(key, msg, enc) { return crypto.createHmac('sha256', key).update(msg).digest(enc); }
function r2SigningKey(date) {
  const kDate = r2Hmac(Buffer.from('AWS4' + R2_SECRET_ACCESS_KEY, 'utf8'), date);
  const kRegion = r2Hmac(kDate, 'auto');
  const kService = r2Hmac(kRegion, 's3');
  return r2Hmac(kService, 'aws4_request');
}
function r2EncodeKey(key) { return String(key || '').split('/').map(encodeURIComponent).join('/'); }
async function r2Request(method, target, body, contentType) {
  if (!R2_CONFIGURED) throw new Error('R2 secrets are not configured');
  const key = r2ObjectKey(target);
  const host = R2_ACCOUNT_ID + '.r2.cloudflarestorage.com';
  const pathname = '/' + encodeURIComponent(R2_BUCKET) + '/' + r2EncodeKey(key);
  const payload = body == null ? '' : body;
  const payloadHash = r2Sha256Hex(payload);
  const amzDate = r2IsoStamp();
  const date = amzDate.slice(0, 8);
  const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map(h => h + ':' + headers[h] + '\n').join('');
  const canonicalRequest = [method, pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = date + '/auto/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, r2Sha256Hex(canonicalRequest)].join('\n');
  const signature = r2Hmac(r2SigningKey(date), stringToSign, 'hex');
  headers.authorization = 'AWS4-HMAC-SHA256 Credential=' + R2_ACCESS_KEY_ID + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  return fetch('https://' + host + pathname, { method, headers, body: payload || undefined });
}
async function r2WriteJson(target, out) {
  const body = JSON.stringify(out);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await r2Request('PUT', target, body, 'application/json; charset=utf-8');
      if (res.status >= 200 && res.status < 300) return true;
      const text = await res.text();
      if (res.status >= 500) { lastErr = new Error('R2 write ' + target + ' ' + res.status); await sleep(400 * (attempt + 1)); continue; }
      throw new Error('R2 write ' + target + ' ' + res.status + ' :: ' + text.slice(0, 240));
    } catch (e) { lastErr = e; await sleep(400 * (attempt + 1)); }
  }
  throw lastErr || new Error('R2 write ' + target + ' failed');
}
async function r2ReadJson(target) {
  const res = await r2Request('GET', target, null, null);
  if (res.status !== 200) throw new Error('R2 read ' + target + ' ' + res.status + ' :: ' + (await res.text()).slice(0, 240));
  return JSON.parse(await res.text());
}
function parseSitemap(xml) {
  return Array.from(String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => htmlUnescape(m[1]));
}
function typeFromUrl(url) {
  const m = String(url || '').match(TYPE_RE);
  return m ? { socionics: m[1], variant: String(url).replace(/\/?$/, '').slice(-1) } : null;
}
function langOfUrl(url) {
  const path = new URL(url).pathname.replace(/^\/+/, '');
  const first = path.split('/')[0] || '';
  return (first === 'en' || first === 'ko' || first === 'ru') ? first : 'ja';
}
function axesFor(soc, variant) {
  const base = Object.assign({}, SOCIONICS_SIGNAL[soc] || {});
  const extra = VARIANT_SIGNAL[variant] || {};
  const out = {};
  AXIS_KEYS.forEach(k => out[k] = clamp1((base[k] || 0) + (extra[k] || 0)));
  return out;
}
function averageAxes(rows) {
  const out = {};
  AXIS_KEYS.forEach(k => out[k] = clamp1(rows.reduce((sum, r) => sum + ((r.axes && r.axes[k]) || 0), 0) / Math.max(1, rows.length)));
  return out;
}

async function main() {
  const outPath = argValue('--out', DEFAULT_OUT);
  const target = argValue('--target', 'assist-mbti-socionics-v1.json');
  const pretty = hasArg('--pretty');
  const xml = await fetchText(SITEMAP);
  const jaTypeUrls = parseSitemap(xml).filter(u => u.startsWith(BASE + '/') && TYPE_RE.test(u));
  const urls = Array.from(new Set(jaTypeUrls)).sort((a, b) => {
    const ta = typeFromUrl(a), tb = typeFromUrl(b);
    return (ta.socionics + ta.variant).localeCompare(tb.socionics + tb.variant);
  });
  const pages = [];
  for (const url of urls) {
    const t = typeFromUrl(url);
    const html = await fetchText(url);
    pages.push({
      socionics: t.socionics,
      variant: t.variant,
      lang: langOfUrl(url),
      mbti: SOCIONICS_TO_MBTI[t.socionics] || null,
      source: url,
      title: titleOf(html),
      description: metaOf(html, 'description'),
      ogImage: metaOf(html, 'og:image'),
      contentHash: sha256(html),
      axes: axesFor(t.socionics, t.variant)
    });
  }
  const byMbti = {};
  Object.keys(MBTI_TO_SOCIONICS).sort().forEach(mbti => {
    const soc = MBTI_TO_SOCIONICS[mbti];
    const rows = pages.filter(p => p.socionics === soc);
    const canonicalRows = rows.filter(p => p.lang === 'ja');
    const assistRows = canonicalRows.length ? canonicalRows : rows;
    byMbti[mbti] = {
      mbti,
      socionics: soc,
      variants: Object.fromEntries(assistRows.map(r => [r.variant, { source: r.source, title: r.title, axes: r.axes }])),
      axes: averageAxes(assistRows),
      internalOnly: true
    };
  });
  const payload = {
    schema: 'assist-mbti-socionics-v1',
    generatedAt: new Date().toISOString(),
    source: {
      site: BASE,
      sitemap: SITEMAP,
      robots: BASE + '/robots.txt',
      storagePolicy: 'short metadata and derived axes only; no copied body text'
    },
    mappingNote: 'MBTI input is mapped to internal Socionics-style profiles for deck-assist personalization. Socionics labels are not intended for user-facing UI.',
    axes: AXIS_KEYS,
    mbtiToSocionics: MBTI_TO_SOCIONICS,
    byMbti,
    pages
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, pretty ? 2 : 0) + '\n');
  console.log('wrote ' + outPath + ' pages=' + pages.length + ' mbti=' + Object.keys(byMbti).length);
  if (hasArg('--publish')) {
    await r2WriteJson(target, payload);
    console.log('published R2 ' + R2_BUCKET + '/' + r2ObjectKey(target));
  }
  if (hasArg('--verify')) {
    const pub = R2_CONFIGURED ? await r2ReadJson(target) : JSON.parse(fs.readFileSync(outPath, 'utf8'));
    if (!pub || pub.schema !== 'assist-mbti-socionics-v1') throw new Error('verify failed: schema');
    if (!pub.byMbti || Object.keys(pub.byMbti).length !== 16) throw new Error('verify failed: byMbti');
    if (!pub.pages || pub.pages.length < 32) throw new Error('verify failed: pages');
    console.log('verified ' + (R2_CONFIGURED ? ('R2 ' + R2_BUCKET + '/' + r2ObjectKey(target)) : outPath));
  }
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
