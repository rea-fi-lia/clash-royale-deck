#!/usr/bin/env node
/*
 * 障害・復旧の通知（2026-08-11）
 *
 * 背景：collectが11回連続で失敗し、データ収集が3時間26分止まっていたのに
 *   誰も気づかなかった（joが「最終更新が17:49で止まってる」と気づいて発覚）。
 *   落ちたことに気づける仕組みが無いのが本当の問題なので、通知を入れる。
 *
 * 送り先は環境変数があるものだけ。無ければ黙ってスキップする（設定した瞬間に動き出す）。
 *   LINE_PUSH_TOKEN + LINE_PUSH_TO … LINE Messaging API の push
 *       ★ReA名義のLINE公式アカウントを想定。園（梅乃園幼稚園）の公式LINEは使わない。
 *         園のアカウントは保護者向けなので、開発通知を混ぜてはいけない。
 *   SLACK_WEBHOOK_URL … Slack Incoming Webhook
 *
 * 使い方:
 *   node tools/notify.js "本文"
 *   node tools/notify.js --title "収集が止まっています" --body "…"
 */
const args = process.argv.slice(2);
function argOne(name) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : null; }
const title = argOne('--title');
const body = argOne('--body') || args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--title' && args[args.indexOf(a) - 1] !== '--body').join(' ');
const text = [title, body].filter(Boolean).join('\n');

if (!text.trim()) { console.error('本文が空です'); process.exit(1); }

async function sendLine() {
  const token = process.env.LINE_PUSH_TOKEN, to = process.env.LINE_PUSH_TO;
  if (!token || !to) return null;
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] })
  });
  return 'LINE ' + res.status + (res.ok ? '' : ' :: ' + (await res.text()).slice(0, 200));
}
async function sendSlack() {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return null;
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  return 'Slack ' + res.status + (res.ok ? '' : ' :: ' + (await res.text()).slice(0, 200));
}

(async () => {
  const results = (await Promise.all([sendLine(), sendSlack()])).filter(Boolean);
  if (!results.length) {
    console.log('通知の送り先が未設定のためスキップしました。');
    console.log('  LINEを使う場合  : LINE_PUSH_TOKEN（ReA名義のチャネルアクセストークン）と LINE_PUSH_TO（送信先のuserId）');
    console.log('  Slackを使う場合 : SLACK_WEBHOOK_URL');
    console.log('--- 送るはずだった内容 ---\n' + text);
    return;
  }
  results.forEach(r => console.log('通知: ' + r));
})().catch(e => { console.error('通知に失敗: ' + ((e && e.message) || e)); });
