#!/bin/bash
# 지금 바로 한 번 커밋하고 올린다 (자동 동기화를 안 켜뒀을 때)
cd "$(dirname "$0")"
node -e "
const {execFileSync}=require('child_process');
const g=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
if(!g('status','--porcelain')){console.log('바뀐 게 없습니다.');process.exit(0)}
g('add','-A');
const f=g('diff','--cached','--name-only').split('\n').filter(Boolean);
const bad=f.filter(x=>/(^|\/)(config\.json|\.env)\$|\.pem\$/.test(x));
if(bad.length){console.error('중단 — 비밀 파일:',bad.join(', '));g('reset');process.exit(1)}
g('commit','-m','수동 동기화: '+f.slice(0,3).join(', ')+(f.length>3?\` 외 \${f.length-3}개\`:''));
g('push','origin','HEAD:main');
console.log('올렸습니다:',f.join(', '));
"
