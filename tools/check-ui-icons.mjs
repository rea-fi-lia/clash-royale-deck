import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(f=>/\.(?:html|css|m?js)$/.test(f)&&!f.startsWith('tools/')&&!f.startsWith('gas/'));
const manifest=JSON.parse(fs.readFileSync('assets/icons/manifest.json','utf8')),mapped=new Set(Object.values(manifest).flatMap(x=>[...x.legacy]));
const baselineFile='tools/ui-icon-legacy-baseline.json',counts={},problems=[];
for(const f of files){const s=fs.readFileSync(f,'utf8');const chars=s.match(/\p{Extended_Pictographic}/gu)||[];
 for(const c of chars)if(!['©','®','™'].includes(c)&&!mapped.has(c))problems.push(f+': unmapped symbol '+c);
 if(chars.length)counts[f]=chars.length;
 if(f.endsWith('.html')&&s.includes('<head>')&&!s.includes('/css/icons.css'))problems.push(f+': original symbol stylesheet missing');
}
if(process.argv.includes('--save-legacy-baseline'))fs.writeFileSync(baselineFile,JSON.stringify(counts,null,2)+'\n');
const baseline=JSON.parse(fs.readFileSync(baselineFile,'utf8'));
for(const [f,n] of Object.entries(counts))if(n>(baseline[f]||0))problems.push(f+': use a named CRDB icon for new UI, not another emoji literal');
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}else console.log('UI icons: '+files.length+' files, '+mapped.size+' legacy characters rendered by '+Object.keys(manifest).length+' original symbols; no new OS emoji.');
