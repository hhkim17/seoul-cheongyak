#!/usr/bin/env node
// 정적 사이트 빌드 — 공고를 전부 받아 docs/ 에 넣는다.
// GitHub Pages가 docs/ 를 그대로 서빙하므로 서버 없이 누구나 열 수 있다.
//   node build.mjs           (config.json 또는 APPLYHOME_SERVICE_KEY 사용)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceKey } from './store.mjs';
import { collectListings, enrichMany, isClosed, sourceStatus, log, state } from './collect.mjs';
import { CORNERS } from './normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');

const copyAssets = () => {
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  for (const f of fs.readdirSync(PUBLIC)) fs.copyFileSync(path.join(PUBLIC, f), path.join(OUT, f));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // _ 로 시작하는 파일도 서빙되게
};

// --assets: 화면 코드만 docs/ 로 복사한다. 인증키도, API 호출도 필요 없다.
// 코드를 고치면 곧바로 사이트에 반영하기 위한 경로.
if (process.argv.includes('--assets')) {
  copyAssets();
  log('화면 코드만 docs/ 로 복사했습니다 (데이터는 그대로).');
  process.exit(0);
}

const key = getServiceKey();
if (!key) {
  console.error('인증키가 없습니다. config.json 을 만들거나 APPLYHOME_SERVICE_KEY 를 지정하세요.');
  process.exit(1);
}

const data = await collectListings(key);

log(`상세 보강 (${data.listings.length}건)`);
let last = 0;
await enrichMany(key, data.listings, (done, total) => {
  if (done - last >= 25 || done === total) { log(`  ${done}/${total}`); last = done; }
});

// 접수 마감된 공고는 경쟁률이 나오므로 한 번 더 확인해 둔다
const closed = data.listings.filter((l) => isClosed(l) && !l.cmpet).length;

const snapshot = {
  builtAt: Date.now(),
  fetchedAt: data.fetchedAt,
  errors: data.errors,
  lhBlocked: data.lhBlocked,
  cmpetBlocked: state.cmpetBlocked,
  corners: CORNERS,
  sources: sourceStatus(data),
  listings: data.listings,
};

fs.rmSync(OUT, { recursive: true, force: true });
copyAssets();
fs.writeFileSync(path.join(OUT, 'data', 'listings.json'), JSON.stringify(snapshot));

const kb = (fs.statSync(path.join(OUT, 'data', 'listings.json')).size / 1024).toFixed(0);
const byCorner = {};
for (const l of data.listings) byCorner[l.corner] = (byCorner[l.corner] || 0) + 1;

log(`빌드 완료 → docs/  (${data.listings.length}건, ${kb}KB, 경쟁률 미공개 ${closed}건)`);
log(`코너별: ${Object.entries(byCorner).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
if (data.errors.length) data.errors.forEach((e) => log(`  ⚠︎ ${e}`));
