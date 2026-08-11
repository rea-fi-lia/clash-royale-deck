#!/usr/bin/env node
/*
 * 修理エージェントに渡す「状況説明」を組み立てる（2026-08-11）
 *
 *   node tools/repair-context.js --workflow collect.yml --run-id 123 --label データ収集
 *
 * 失敗ログ・直近の変更・関係するファイルを1枚のブリーフにする。
 * ★ここに書いた禁止事項がそのまま自動修理の歯止めになる。触らせたくないものは必ずここに足す。
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const argOne = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : null; };
const workflow = argOne('--workflow');
const runId = argOne('--run-id');
const label = argOne('--label') || workflow;

const sh = (cmd, a) => { try { return execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 20e6 }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

// 失敗したステップのログ。長すぎると本題が埋もれるので末尾だけ
const log = sh('gh', ['run', 'view', runId, '--log-failed']).slice(-8000);
// 直近の変更。壊れた原因はたいてい直前のコミットにある
const commits = sh('git', ['log', '--oneline', '-12', '--date=short', '--pretty=%h %ad %s']);
// このワークフローが何をしているか
let wf = '';
try { wf = fs.readFileSync('.github/workflows/' + workflow, 'utf8'); } catch (_) {}

const brief = `# 自動修理の依頼：${label}（${workflow}）が失敗している

あなたはCR Deck Buildersの保守担当です。**最小限の変更で失敗を直してください。**

## 何が起きたか
ワークフロー \`${workflow}\` が続けて失敗しました。実行ID: ${runId}

## 失敗したステップのログ（末尾）
\`\`\`
${log || '(ログが取得できませんでした)'}
\`\`\`

## 直近のコミット（原因は直前の変更にあることが多い）
\`\`\`
${commits}
\`\`\`

## ワークフローの定義
\`\`\`yaml
${wf.slice(0, 6000)}
\`\`\`

## 過去に起きた失敗（同じ轍を踏まないために）
- **2026-08-11 メモリ不足**：帯別イベントの保持上限を上げたら \`(旧22万件).concat(今回分)\` が巨大な中間配列を作り
  \`JavaScript heap out of memory (exit 134)\` で11回連続失敗・3時間26分停止。
  → 直し方は「concatをやめて1本の配列にpushしながらその場で期限切れを捨てる」＋上限を現実的な値へ。
- **2026-08-11 式の評価**：composite actionの \`inputs.description\` に \`\${{ }}\` を書いたら
  \`Unrecognized named-value\` でaction自体が読めなくなった。説明文に式を書かないこと。

## ★やってはいけないこと（守らないと採用されません）
1. **mainブランチに直接pushしない。** 必ず作業ブランチの上だけで作業する
2. **\`3d.html\` / \`css/neo3d.css\` / \`js/neo3d.js\` は絶対にコミットしない**（未追跡のまま置く約束のファイル）
3. **上限値（SEED_PER_RUN, PER_BAND_KEEP, TOTAL_KEEP 等）を引き上げない。** 落ちているときに枠を広げるのは逆効果。
   下げるのは可
4. **秘密情報（トークン・鍵）をコードやログに書かない**
5. **仕様を変えない。** 失敗を直すことだけをする。ついでのリファクタや機能追加はしない
6. **画像は \`cardImageSrc\`、検索は \`cardSearchMatch\` を通す**（単一ソース規約）。
   \`<img src=\` の直書きや \`yomi\` の直接参照を新たに増やさない
7. **原因が分からないなら、無理に直さない。** 何も変更せず「分からなかった」と報告する方が良い

## やること
1. ログから**根本原因**を特定する
2. **最小限の差分**で直す
3. 直したら、その変更が構文として正しいことを確認する（\`node --check <file>\`）
4. 最後に、日本語で3行以内の説明を \`REPAIR_SUMMARY.md\` に書く：
   - 原因（何が起きていたか）
   - 直した内容（どのファイルをどう変えたか）
   - 自信度（高い／低い。低いなら何が不確かか）

この後、変更は**自動でテスト実行され、通ったときだけ**人間に提案されます。壊れた修正を出しても本番には入りません。
`;

process.stdout.write(brief);
