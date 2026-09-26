#!/usr/bin/env node
// 정적 사이트 빌드 — 공고를 전부 받아 docs/ 에 넣는다.
// GitHub Pages가 docs/ 를 그대로 서빙하므로 서버 없이 누구나 열 수 있다.
//   node build.mjs           (config.json 또는 APPLYHOME_SERVICE_KEY 사용)

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceKey } from './store.mjs';
import { collectListings, enrichMany, readCriteriaMany, isClosed, sourceStatus, log, state } from './collect.mjs';
import { CORNERS } from './normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs');

// 브라우저가 index.html 과 app.js 를 서로 다른 시점 것으로 물고 있으면
// 화면 조각이 어긋나 버튼이 죽는다. 그래서 주소에 내용 해시를 붙여
// 코드가 바뀌면 반드시 새로 받게 한다.
const stampAssets = () => {
  const files = ['app.js', 'styles.css', 'standards.js', 'rank.js', 'sync.js']
    .filter((f) => fs.existsSync(path.join(OUT, f)));
  const h = crypto.createHash('sha1');
  for (const f of files) h.update(fs.readFileSync(path.join(OUT, f)));
  const v = h.digest('hex').slice(0, 8);

  const idx = path.join(OUT, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8')
    .replace(/(href|src)="((?:styles\.css|app\.js))"/g, `$1="$2?v=${v}"`));

  const appJs = path.join(OUT, 'app.js');
  fs.writeFileSync(appJs, fs.readFileSync(appJs, 'utf8')
    .replace(/from '\.\/(sync|standards|rank)\.js'/g, `from './$1.js?v=${v}'`));
  return v;
};

const copyAssets = () => {
  // 기준표는 standards.mjs 하나만 고치면 되도록, 화면용 사본을 여기서 만든다
  fs.copyFileSync(path.join(ROOT, 'standards.mjs'), path.join(PUBLIC, 'standards.js'));
  fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
  for (const f of fs.readdirSync(PUBLIC)) fs.copyFileSync(path.join(PUBLIC, f), path.join(OUT, f));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // _ 로 시작하는 파일도 서빙되게
  return stampAssets();
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

// 직전 스냅샷 — 상류 API 장애로 텅 빈 결과가 나왔을 때 덮어쓰지 않기 위한 기준
const prevPath = path.join(OUT, 'data', 'listings.json');
let prev = null;
let carried = [];   // 상류가 죽은 출처를 직전 스냅샷에서 그대로 가져온 것
try { prev = JSON.parse(fs.readFileSync(prevPath, 'utf8')); } catch { /* 첫 빌드 */ }

const data = await collectListings(key);

/**
 * 청약홈·LH 같은 상류 API는 가끔 오류가 아니라 '0건'을 돌려준다.
 * 그대로 배포하면 사이트가 비고, 다음 정상 빌드 때 전부 '새 공고'로 잡혀
 * 알림이 폭주한다. 직전보다 크게 줄면 배포하지 않고 이전 데이터를 지킨다.
 */
if (prev?.listings?.length) {
  const before = prev.listings.length;
  const after = data.listings.length;
  // 전체 건수만 보면, 한 출처가 통째로 죽어도 다른 출처가 늘어 가려진다.
  // 실제로 청약홈이 totalCount 0 을 주던 날 아파트·오피스텔·무순위 128건이
  // 사라졌는데 합계는 80%라 이 가드를 통과했다. 그래서 출처별로도 본다.
  // source 는 청약홈 항목에 비어 있어 서로 다른 출처가 한 칸에 뭉친다. kind 로 센다.
  const byKind = (rows) => rows.reduce((m, l) => (m[l.kind] = (m[l.kind] || 0) + 1, m), {});
  const pb = byKind(prev.listings);
  const nb = byKind(data.listings);
  const vanished = Object.entries(pb).filter(([k, n]) => n >= 5 && !nb[k]).map(([k, n]) => `${k}(${n}건→0)`);

  // 전부 무너졌으면 손대지 않는 게 안전하다
  if (after < before * 0.6 && !vanished.length) {
    log(`::warning::수집 결과가 ${before}건 → ${after}건으로 급감했습니다. 상류 API 장애로 보고 데이터를 갱신하지 않습니다.`);
    data.errors.forEach((e) => log(`  ⚠︎ ${e}`));
    copyAssets();   // 화면 코드는 최신으로 두되 데이터는 그대로 둔다
    log('화면 코드만 반영하고 종료합니다.');
    process.exit(0);
  }

  // 일부 출처만 죽었으면 통째로 버리지 않는다. 죽은 출처는 직전 값을 그대로 쓰고
  // 나머지는 새로 받은 값을 쓴다. 그래야 멀쩡한 출처의 새 공고가 같이 막히지 않는다.
  if (vanished.length) {
    const deadKinds = new Set(Object.keys(pb).filter((k) => pb[k] >= 5 && !nb[k]));
    carried = prev.listings.filter((l) => deadKinds.has(l.kind));
    log(`::warning::출처가 통째로 비었습니다: ${vanished.join(', ')}. 해당 ${carried.length}건은 직전 값을 그대로 씁니다.`);
    data.errors.forEach((e) => log(`  ⚠︎ ${e}`));
  }
}

log(`상세 보강 (${data.listings.length}건)`);
let last = 0;
await enrichMany(key, data.listings, (done, total) => {
  if (done - last >= 25 || done === total) { log(`  ${done}/${total}`); last = done; }
});

// 공고문(PDF)에서 소득·자산 기준을 읽는다 — 유형별 일반 기준보다 정확하다
await readCriteriaMany(data.listings, (done, total) => {
  if (done % 5 === 0 || done === total) log(`  공고문 ${done}/${total}`);
});

// 상류가 죽어 새로 못 받은 출처를 직전 값으로 채운다 (이미 보강된 것들이라 그대로 둔다)
if (carried.length) {
  const have = new Set(data.listings.map((l) => l.id));
  const add = carried.filter((l) => !have.has(l.id));
  data.listings.push(...add);
  log(`직전 스냅샷에서 ${add.length}건을 이어 붙였습니다.`);
}

// 접수 마감된 공고는 경쟁률이 나오므로 한 번 더 확인해 둔다
const closed = data.listings.filter((l) => isClosed(l) && !l.cmpet).length;

const snapshot = {
  builtAt: Date.now(),
  fetchedAt: data.fetchedAt,
  errors: data.errors,
  lhBlocked: data.lhBlocked,
  cmpetBlocked: state.cmpetBlocked,
  corners: CORNERS,
  standards: data.standards,
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
