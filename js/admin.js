const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = value => Number.isFinite(Number(value)) && value !== null && value !== undefined ? Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—';
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未取得';
const names = { ga4: 'GA4 レポート', realtime: 'GA4 リアルタイム', firebaseAuth: 'Firebase 登録者', firestore: 'Firestore 利用状況', adsense: 'AdSense', searchConsole: 'Search Console', x: 'X 投稿・反応', operations: 'GitHub / 収集', cloudflare: 'Cloudflare', stripe: 'Stripe' };
const instructions = {
  ga4: 'GA4の読み取り接続で、訪問者・PV・流入・ページ別の実数を表示します。',
  realtime: '過去30分のアクティブユーザーを、GA4から取得します。',
  firebaseAuth: 'Firebase Authenticationから登録数・新規登録・ログイン状況を取得します。',
  firestore: 'プロフィール数・CRタグ連携・保存デッキ数を、集計だけ取得します。',
  adsense: '読み取り接続で、サイト審査状況・見積収益・表示回数・注意事項を表示します。',
  searchConsole: '検索クリック・表示回数・掲載順位・検索語を取得します。',
  x: '投稿時刻・いいね・リポスト・返信を取得します。毎日投稿の実行元は別途接続します。',
  operations: '本番APIとGitHub Actions、収集マーカーの更新を確認します。',
  cloudflare: 'APIリクエスト・エラー・処理時間を取得します。',
  stripe: '読み取り専用の接続で、決済受付・審査制限・残高を表示します。'
};
const reasons = { not_connected: '未接続', permission_required: '読み取り権限を確認', rate_limited: '取得上限に到達', connection_failed: '接続を確認', invalid_response: '応答を確認', upstream_error: '取得先でエラー', wrong_project: '接続先を確認', query_unavailable: '指標の取得条件を確認', restricted_read_key_required: '読み取りキーが必要', unavailable: '取得できません', partial_response: '一部取得できません' };
const isPreview = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
let currentUser = null, requestVersion = 0, loading = false, controller = null;
function pill(text, cls = '') { return `<span class="pill ${cls}">${escape(text)}</span>`; }
function sourceMeta(source) { return source?.status === 'connected' ? `取得 ${time(source.collectedAt)} · ${source.refreshSeconds || '—'}秒間隔${source.cached ? ' · 保存した取得結果' : ''}` : reasons[source?.code || source?.status] || '未接続'; }
function empty(name, source, custom) { return `<div class="empty"><span class="empty-icon">◇</span><strong>${escape(custom || reasons[source?.code || source?.status] || '接続を待っています')}</strong><p>${escape(instructions[name])}</p></div>`; }
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(x => `<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(x => `<td>${escape(x)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">この期間のデータはありません</td></tr>`}</tbody></table></div>`; }
function bars(rows, label, metric) {
  const maximum = Math.max(1, ...rows.map(x => Number(x[metric]) || 0));
  return rows.length ? rows.slice(0, 8).map(row => `<div class="bar-row"><span class="bar-label" title="${escape(row[label])}">${escape(row[label])}</span><span class="bar-track"><i style="width:${Math.max(0, Number(row[metric]) || 0) / maximum * 100}%"></i></span><span class="bar-value">${number(row[metric])}</span></div>`).join('') : '<p class="note">この期間のデータはありません。</p>';
}
function stat(label, value, unit = '') { return `<div class="stat"><span>${escape(label)}</span><strong>${escape(value)}<small> ${escape(unit)}</small></strong></div>`; }
function safeLink(url) { try { const u = new URL(url); return u.protocol === 'https:' && ['github.com', 'x.com'].includes(u.hostname) ? u.href : '#'; } catch { return '#'; } }
function delta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return '前期間との比較は未取得';
  if (!previous) return current ? '前期間 0 → 今期間に利用あり' : '前期間と同じ';
  const change = (current - previous) / previous * 100;
  return `<span class="${change >= 0 ? 'positive' : 'negative'}">${change > 0 ? '+' : ''}${change.toFixed(1)}%</span> 前の同期間比`;
}
function chart(rows) {
  if (!rows.length) return '<div class="empty"><strong>この期間のデータはありません</strong></div>';
  const width = 780, height = 220, max = Math.max(1, ...rows.map(x => x.activeUsers || 0));
  const points = rows.map((row, i) => [42 + i / Math.max(1, rows.length - 1) * (width - 60), height - 28 - (row.activeUsers || 0) / max * (height - 48)]);
  const line = points.map(p => p.join(',')).join(' ');
  const labels = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text class="chart-label" x="${points[i][0]}" y="${height - 6}" text-anchor="middle">${escape(rows[i].date.slice(4, 6) + '/' + rows[i].date.slice(6))}</text>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="日別のGA4アクティブユーザー数。詳細は下の表を開いて確認。"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dbbd83" stop-opacity=".22"/><stop offset="100%" stop-color="#dbbd83" stop-opacity="0"/></linearGradient></defs>${[0, .5, 1].map(t => `<line class="chart-grid" x1="40" y1="${height - 28 - t * (height - 48)}" x2="${width - 10}" y2="${height - 28 - t * (height - 48)}"/><text class="chart-label" x="0" y="${height - 24 - t * (height - 48)}">${number(max * t)}</text>`).join('')}<polygon fill="url(#chart-fill)" points="42,${height - 28} ${line} ${width - 18},${height - 28}"/><polyline class="chart-line" points="${line}"/>${points.length === 1 ? `<circle class="chart-dot" cx="${points[0][0]}" cy="${points[0][1]}" r="3"/>` : ''}${labels}</svg><details class="raw"><summary>日別の数値</summary>${table(['日付', 'アクティブ', 'セッション', 'PV'], rows.map(x => [x.date, number(x.activeUsers), number(x.sessions), number(x.screenPageViews)]))}</details>`;
}
function render(summary) {
  const sources = summary.sources || {}, data = name => sources[name]?.status === 'connected' ? sources[name].data : null;
  const ga = data('ga4'), auth = data('firebaseAuth'), fs = data('firestore'), ads = data('adsense'), ops = data('operations'), social = data('x'), search = data('searchConsole'), cf = data('cloudflare'), stripe = data('stripe');
  const current = ga?.overview.find(r => r.dateRange === 'current') || (ga?.overview.length === 1 ? ga.overview[0] : null);
  const previous = ga?.overview.find(r => r.dateRange === 'previous');
  const kpi = (label, value, unit, note) => `<article class="kpi"><div class="kpi-label">${label}</div><div class="kpi-number">${value}<small>${unit}</small></div><div class="kpi-note">${note}</div></article>`;
  $('kpis').innerHTML = [
    kpi('訪れてくれた人 / 総ユーザー', number(current?.totalUsers), '人', ga ? delta(current?.totalUsers, previous?.totalUsers) : 'GA4 接続待ち'),
    kpi('サイトの閲覧 / 表示回数', number(current?.screenPageViews), 'PV', ga ? delta(current?.screenPageViews, previous?.screenPageViews) : 'GA4 接続待ち'),
    kpi('アカウント登録 / 累計', (auth && !auth.complete ? '≥ ' : '') + number(auth?.registered), '人', auth ? `過去7日 +${number(auth.new7d)}人${!auth.complete ? ' · 一部集計' : ''}` : 'Firebase Authentication 接続待ち'),
    kpi('データ収集 / 直近24時間', number(ops?.collections24h), '回', ops ? `最大間隔 ${number(ops.maxGapMinutes)}分 · ${ops.collectionOk ? '基準内' : '要確認'}` : '稼働状況を取得中')
  ].join('');
  $('ga-chart').innerHTML = ga ? chart(ga.trend) : empty('ga4', sources.ga4);
  $('ga-detail').innerHTML = current ? `<div class="stats-grid">${stat('アクティブユーザー', number(current.activeUsers), '人')}${stat('新規ユーザー', number(current.newUsers), '人')}${stat('セッション', number(current.sessions), '回')}${stat('エンゲージメント率', number(current.engagementRate * 100), '%')}</div><p class="note">アクティブユーザーあたりの平均エンゲージメント時間：${current.activeUsers > 0 ? number(current.userEngagementDuration / current.activeUsers) + '秒' : '—'}</p>` : '';
  $('ga-meta').textContent = ga ? `${sourceMeta(sources.ga4)} · ${ga.timeZone || 'プロパティ設定のタイムゾーン'} / ${summary.days}日前〜昨日` : 'GA4の数値を取得するまでグラフは表示しません。';
  $('ga-raw').textContent = ga ? JSON.stringify(ga.raw, null, 2) : '未取得';
  $('realtime-number').innerHTML = `${number(data('realtime')?.activeUsers)}<small>人</small>`;
  $('realtime-meta').textContent = sourceMeta(sources.realtime);
  $('channels').innerHTML = ga ? bars(ga.channels, 'sessionDefaultChannelGroup', 'sessions') : empty('ga4', sources.ga4);
  $('source-medium').innerHTML = ga ? `<details class="raw"><summary>参照元 / メディア（X経由を含む）</summary>${table(['参照元', 'セッション'], ga.sources.map(x => [x.sessionSourceMedium, number(x.sessions)]))}</details>` : '';
  $('pages').innerHTML = ga ? table(['ページ', 'PV', '利用者'], ga.pages.slice(0, 8).map(x => [x.pagePath, number(x.screenPageViews), number(x.activeUsers)])) : empty('ga4', sources.ga4);
  $('countries').innerHTML = ga ? bars(ga.countries, 'country', 'activeUsers') : empty('ga4', sources.ga4);
  $('devices').innerHTML = ga ? bars(ga.devices, 'deviceCategory', 'activeUsers') : empty('ga4', sources.ga4);
  $('events').innerHTML = ga ? table(['イベント', '回数'], ga.events.slice(0, 7).map(x => [x.eventName, number(x.eventCount)])) : empty('ga4', sources.ga4);
  $('community-data').innerHTML = (auth ? `<div class="stats-grid">${stat('登録アカウント / 累計', `${auth.complete ? '' : '≥ '}${number(auth.registered)}`, '人')}${stat('新規登録 / 過去7日', number(auth.new7d), '人')}${stat('ログインした人 / 過去7日', number(auth.signedIn7d), '人')}${stat('無効化中 / 累計', number(auth.disabled), '人')}</div><p class="note">${escape(sourceMeta(sources.firebaseAuth))}${auth.complete ? '' : ' · 集計上限に達したため下限値です。'}</p>` : empty('firebaseAuth', sources.firebaseAuth)) +
    (fs ? `<div class="section-sub"><h3>Firestoreに保存されている利用状況</h3><div class="stats-grid">${stat('プロフィール', number(fs.profiles), '件')}${stat('CRタグ連携', number(fs.linkedTags), '人')}${stat('保存デッキ・スロット', number(fs.savedDecks), '件')}${stat('新規プロフィール / 7日', number(fs.newProfiles7d), '件')}</div><p class="note">${escape(fs.note)}<br>${escape(sourceMeta(sources.firestore))}</p></div>` : `<div class="section-sub">${empty('firestore', sources.firestore)}</div>`);
  const siteStates = { READY: '広告配信可能', GETTING_READY: '審査中', NEEDS_ATTENTION: '対応が必要', REQUIRES_REVIEW: '審査が必要' };
  let adMarkup = ads ? `<div>${pill(siteStates[ads.site?.state] || 'サイト状態を確認', ads.site?.state === 'READY' ? 'good' : 'warn')}<p class="note">crdeckbuilders.com · ${escape(sourceMeta(sources.adsense))}</p></div>` : empty('adsense', sources.adsense);
  if (ads?.report) {
    const cells = ads.report.totals?.cells || ads.report.rows?.[0]?.cells || [];
    adMarkup += table(['AdSense 指標', '値'], (ads.report.headers || []).map((h, i) => [h.name, `${cells[i]?.value ?? '—'}${h.currencyCode ? ' ' + h.currencyCode : ''}`]));
  } else if (ads) adMarkup += `<p class="note">広告レポート: ${escape(reasons[ads.reportStatus] || '未取得')}（0円とは判定しません）</p>`;
  for (const alert of ads?.alerts || []) adMarkup += `<p class="note negative">${escape(alert.message || alert.type)}</p>`;
  const currency = x => { try { return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: x.currency }).format(x.amountMinor / (['jpy','krw','vnd','clp','bif','djf','gnf','kmf','mga','pyg','rwf','ugx','vuv','xaf','xof','xpf'].includes(x.currency) ? 1 : 100)); } catch { return `${x.amountMinor} ${x.currency} (minor units)`; } };
  adMarkup += `<div class="section-sub"><h3>Stripe / 決済</h3>${stripe ? `${pill(stripe.chargesEnabled ? '決済受付可' : '決済受付停止', stripe.chargesEnabled ? 'good' : 'bad')} ${pill(stripe.payoutsEnabled ? '入金機能有効' : '入金機能停止')}<p class="note">残高 ${escape(stripe.available.map(currency).join(' / ') || '未取得')}<br>保留 ${escape(stripe.pending.map(currency).join(' / ') || '未取得')}<br>${escape(stripe.disabledReason || '制限理由の記録なし')} · ${escape(sourceMeta(sources.stripe))}</p>` : empty('stripe', sources.stripe)}</div>`;
  $('revenue-data').innerHTML = adMarkup;
  $('x-data').innerHTML = social ? `<div>${pill(social.cadence === 'attention' ? '30時間以上、新しい投稿なし' : social.cadence === 'recent_post_exists' ? '直近の投稿あり' : '投稿を確認できません', social.cadence === 'attention' ? 'bad' : social.cadence === 'recent_post_exists' ? 'good' : 'warn')} ${pill('自動投稿の実行ログは未接続', 'warn')}</div><div class="stats-grid">${stat('フォロワー / 現在', number(social.publicMetrics?.followers_count), '人')}${stat('最新投稿から', number(social.latestAgeHours), '時間')}</div>${social.posts.slice(0, 5).map(p => `<article class="post"><a href="${escape(safeLink(p.url))}" target="_blank" rel="noopener">${time(p.createdAt)} ↗</a><p>${escape(p.text)}</p><small>♡ ${number(p.metrics.like_count)}　↻ ${number(p.metrics.retweet_count)}　返信 ${number(p.metrics.reply_count)}　引用 ${number(p.metrics.quote_count)}${p.metrics.impression_count !== undefined ? '　表示 ' + number(p.metrics.impression_count) : ''}</small></article>`).join('')}<p class="note">${escape(social.note)}<br>${escape(sourceMeta(sources.x))}</p>` : `${empty('x', sources.x)}<div class="section-sub">${pill('毎日投稿の実行元を確認中', 'warn')}<p class="note">投稿の存在・投稿処理の成功・Xからのサイト流入を分けて確認します。GitHubのdaily digestは運用通知です。</p></div>`;
  $('search-data').innerHTML = search ? `<div class="stats-grid">${stat('検索クリック', number(search.summary?.clicks), '回')}${stat('検索で表示', number(search.summary?.impressions), '回')}${stat('平均掲載順位', number(search.summary?.position), '位')}${stat('クリック率', search.summary ? number(search.summary.ctr * 100) : '—', '%')}</div>${table(['検索語', 'クリック'], search.queries.map(x => [x.keys?.[0], number(x.clicks)]))}<p class="note">${escape(search.note)}<br>${escape(sourceMeta(sources.searchConsole))}</p>` : empty('searchConsole', sources.searchConsole);
  const jobLabel = { 'collect.yml': 'データ収集', 'digest.yml': '毎朝の運用通知', 'build-card-stats.yml': 'カード統計', 'check-card-images.yml': '画像・リンク検査', 'auto-repair.yml': '自動修復の確認' };
  const jobStatus = run => !run ? '未取得' : run.status !== 'completed' ? '実行中・待機中' : run.conclusion === 'success' ? '成功' : run.conclusion || '不明';
  $('ops-data').innerHTML = ops ? `<div>${pill(ops.healthy ? '本番API 正常' : '本番API 要確認', ops.healthy ? 'good' : 'bad')} ${pill(ops.collectionOk ? '収集間隔 基準内' : '収集に要確認あり', ops.collectionOk ? 'good' : 'bad')}</div><div class="stats-grid">${stat('統計の最終更新', time(ops.collectionUpdatedAt))}${stat('直近24時間 / 収集', number(ops.collections24h), '回')}${stat('最大間隔 / 現在の待ち時間も含む', number(ops.maxGapMinutes), '分')}${stat('トロフィー帯', number(ops.bands), '/ 47')}</div><div class="table-wrap"><table><thead><tr><th>処理</th><th>状態</th><th>最終実行</th></tr></thead><tbody>${ops.latest.map(x => `<tr><td>${x.run ? `<a href="${escape(safeLink(x.run.url))}" target="_blank" rel="noopener">${escape(jobLabel[x.file] || x.file)} ↗</a>` : escape(jobLabel[x.file] || x.file)}</td><td>${pill(jobStatus(x.run), x.run?.conclusion === 'success' ? 'good' : '')}</td><td>${time(x.run?.startedAt)}</td></tr>`).join('')}</tbody></table></div><p class="note">${escape(ops.note)}<br>${escape(sourceMeta(sources.operations))}</p>` : empty('operations', sources.operations);
  const requests = cf?.groups.reduce((sum, x) => sum + Number(x.sum?.requests || 0), 0), errors = cf?.groups.reduce((sum, x) => sum + Number(x.sum?.errors || 0), 0);
  $('cf-data').innerHTML = cf ? `<div class="stats-grid">${stat('リクエスト / 24時間', number(requests))}${stat('エラー / 24時間', number(errors))}</div><p class="note">${escape(cf.note)}<br>${escape(sourceMeta(sources.cloudflare))}</p>` : empty('cloudflare', sources.cloudflare);
  const connected = Object.values(sources).filter(x => x.status === 'connected').length;
  $('connection-count').textContent = `${connected} / ${Object.keys(names).length} 接続`;
  $('connection-data').innerHTML = Object.entries(names).map(([key, name]) => `<div class="connection"><strong>${name}</strong>${pill(sources[key]?.status === 'connected' ? '取得済み' : reasons[sources[key]?.code || sources[key]?.status] || '未接続', sources[key]?.status === 'connected' ? 'good' : 'warn')}<small>${escape(sourceMeta(sources[key]))}</small></div>`).join('');
  const alerts = [];
  if (ops && !ops.collectionOk) alerts.push('統計収集の回数・鮮度・最大間隔に確認が必要です。');
  if (ads?.site?.state === 'NEEDS_ATTENTION') alerts.push('AdSenseのサイトに対応が必要です。元の管理画面で理由を確認してください。');
  if (stripe && !stripe.chargesEnabled) alerts.push('Stripeが決済を受け付けられない状態です。');
  if (social?.cadence === 'attention') alerts.push('Xの最新投稿から30時間以上経過しています。投稿の実行元を確認してください。');
  for (const job of ops?.latest || []) {
    if (job.run?.status === 'completed' && ['failure', 'timed_out', 'action_required'].includes(job.run.conclusion)) alerts.push(`${jobLabel[job.file] || job.file} の最新実行に問題があります。`);
    if (['digest.yml', 'build-card-stats.yml', 'check-card-images.yml'].includes(job.file) && job.run?.startedAt && Date.now() - Date.parse(job.run.startedAt) > 30 * 3600000) alerts.push(`${jobLabel[job.file]} の実行が30時間以上確認できていません。`);
  }
  $('alerts').innerHTML = alerts.map(x => `<div class="alert">!　${escape(x)}</div>`).join('');
}
function lock(message, login = false) {
  requestVersion++; controller?.abort(); loading = false;
  $('dashboard').hidden = true; $('gate').hidden = false; $('gate-message').textContent = message; $('admin-login').hidden = !login;
  $('owner-state').textContent = '管理者専用';
  // Clear private content from the DOM on sign-out or expiry, not just hide it.
  for (const id of ['kpis','alerts','ga-chart','ga-detail','ga-meta','ga-raw','channels','source-medium','pages','countries','devices','events','community-data','revenue-data','x-data','search-data','ops-data','cf-data','connection-data']) $(id).textContent = '';
  $('realtime-number').textContent = '—'; $('realtime-meta').textContent = ''; $('connection-count').textContent = '';
}
async function refresh() {
  if (loading || (!isPreview && !currentUser)) return;
  loading = true; const version = ++requestVersion;
  controller?.abort(); controller = new AbortController();
  $('refresh').disabled = true; $('refresh-state').textContent = '最新の取得状況を確認しています…';
  try {
    const headers = isPreview ? {} : { Authorization: `Bearer ${await currentUser.getIdToken()}` };
    if (version !== requestVersion) return;
    const endpoint = isPreview ? '/__preview__/admin-data' : '/api/admin/summary';
    const res = await fetch(`${endpoint}?days=${$('period').value}`, { headers, cache: 'no-store', signal: controller.signal });
    if (version !== requestVersion) return;
    if ([401, 403].includes(res.status)) return lock('このページは指定されたGoogleアカウント専用です。管理者のGoogleアカウントでログインしてください。', true);
    if (!res.ok) {
      if (!isPreview) return lock('管理者APIがまだ接続されていないか、取得できない状態です。公開設定と接続状態の確認が必要です。');
      throw new Error('unavailable');
    }
    const summary = await res.json();
    if (version !== requestVersion) return;
    $('gate').hidden = true; $('dashboard').hidden = false; $('preview-notice').hidden = !isPreview;
    $('owner-state').textContent = isPreview ? 'LOCAL PREVIEW · 非公開データなし' : '◇ 管理者としてログイン中';
    render(summary); $('refresh-state').textContent = `最終確認 ${time(summary.generatedAt)}${isPreview ? ' · 公開情報のみ' : ''}`;
  } catch (error) {
    if (version === requestVersion && error.name !== 'AbortError') {
      if (!isPreview) lock('認証または通信を確認できませんでした。再ログインしてやり直してください。', true);
      else { $('gate-message').textContent = 'プレビューの稼働情報を取得できませんでした。'; $('refresh-state').textContent = '取得に失敗しました。更新で再試行できます。'; }
    }
  } finally { if (version === requestVersion) loading = false; $('refresh').disabled = false; }
}
$('period').addEventListener('change', () => { requestVersion++; controller?.abort(); loading = false; refresh(); });
$('refresh').addEventListener('click', refresh);
$('admin-login').addEventListener('click', () => window.CRAuth?.signInGoogle());
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
  }
}, { rootMargin: '-125px 0px -65% 0px' });
for (const id of ['overview','audience','community','revenue','social','operations','connections']) observer.observe($(id));
if (isPreview) {
  render({ sources: {}, days: 7 }); $('gate').hidden = true; $('dashboard').hidden = false; $('preview-notice').hidden = false;
  refresh();
} else {
  try {
    await import('/auth.js');
    const auth = window.CRAuth;
    auth.onChange(user => { currentUser = user; lock(user ? '管理者権限を確認しています。' : '管理者のGoogleアカウントでログインしてください。', !user); if (user) refresh(); });
    // Existing CRAuth does not invoke onChange for initial signed-out state.
    const initial = setInterval(() => {
      if (auth.isAuthReady()) { clearInterval(initial); if (!auth.getUser()) lock('管理者のGoogleアカウントでログインしてください。', true); }
    }, 300);
    setTimeout(() => { clearInterval(initial); if (!auth.isAuthReady()) lock('Googleログインを準備できませんでした。再読み込みしてください。'); }, 15000);
  } catch { lock('ログイン機能を読み込めませんでした。再読み込みしてください。'); }
}
