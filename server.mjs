#!/usr/bin/env node
// 서울 청약 대시보드 — 로컬 서버
// 인증키를 서버가 쥐고 청약홈·LH OpenAPI를 프록시한다(브라우저 CORS 회피 + 키 노출 방지).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, ApplyHomeError } from './api.mjs';
import { getServiceKey, writeConfig, cacheGet, cacheSet, cacheClear, cacheDelete } from './store.mjs';
import { collectListings, enrich, enrichMany, sourceStatus, LIST_TTL, DETAIL_TTL, log, state } from './collect.mjs';
import { CORNERS } from './normalize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const WATCH = path.join(ROOT, 'watch.json');
const PORT = Number(process.env.PORT || 5173);
const AUTO_REFRESH_MS = Number(process.env.AUTO_REFRESH_MINUTES || 30) * 60000;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };

let enriching = false;
let enrichProgress = { done: 0, total: 0 };
let memo = null;
let lastAutoRefresh = null;

async function enrichAll(key, targets) {
  if (enriching || !targets.length) return;
  enriching = true;
  enrichProgress = { done: 0, total: targets.length };
  log(`상세 보강 시작 (${targets.length}건)`);
  await enrichMany(key, targets, (done, total) => { enrichProgress = { done, total }; });
  log('상세 보강 완료');
  enriching = false;
}

/**
 * refresh: 공고 목록만 다시 받는다(상세 캐시는 유지 — 빠르고 호출량이 적다)
 * hard:    캐시를 전부 비우고 처음부터 다시 받는다
 */
async function getData(key, { refresh = false, hard = false } = {}) {
  if (hard) { cacheClear(); memo = null; }
  else if (refresh) { cacheDelete('listings'); memo = null; }

  const cached = cacheGet('listings', LIST_TTL);
  const data = cached ? cached.value : cacheSet('listings', await collectListings(key));

  // 캐시된 상세를 즉시 덧입히고, 없거나 만료된 건만 백그라운드로 채운다.
  // 상세 TTL이 지나면 다시 받으므로 접수 마감 후 새로 공개된 경쟁률도 따라온다.
  const stale = [];
  for (const l of data.listings) {
    const hit = cacheGet(`enrich_${l.id}`, DETAIL_TTL);
    if (hit) Object.assign(l, hit.value);
    else stale.push(l);
  }
  if (stale.length && !enriching) enrichAll(key, stale);

  memo = data;
  return data;
}

// 주기적 자동 갱신 — 새 공고와 새로 공개된 경쟁률을 알아서 물어온다
if (AUTO_REFRESH_MS > 0) {
  setInterval(async () => {
    const key = getServiceKey();
    if (!key || enriching) return;
    try { await getData(key, { refresh: true }); lastAutoRefresh = Date.now(); log('자동 갱신 완료'); }
    catch (e) { log('자동 갱신 실패 —', e.message); }
  }, AUTO_REFRESH_MS);
}

// ── HTTP ─────────────────────────────────────────────────────────────
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
  send(res, 200, fs.readFileSync(file, 'utf8'), MIME[path.extname(file)] || 'application/octet-stream');
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/api/health') {
      return send(res, 200, {
        hasKey: !!getServiceKey(), enriching, progress: enrichProgress,
        cachedAt: cacheGet('listings')?.savedAt ?? null,
        lastAutoRefresh, autoRefreshMinutes: AUTO_REFRESH_MS / 60000,
      });
    }

    if (p === '/api/key' && req.method === 'POST') {
      const k = String((await readBody(req)).serviceKey || '').trim();
      if (!k) return send(res, 400, { error: '인증키를 입력해 주세요.' });
      try { await api.ping(k); }
      catch (e) {
        return send(res, 400, {
          error: e.status === 401
            ? '인증키가 올바르지 않거나 아직 승인 전입니다. 공공데이터포털의 “일반 인증키” 값을 그대로 붙여넣었는지 확인해 주세요. (활용신청 직후 최대 1시간 반영 지연)'
            : e.message,
        });
      }
      writeConfig({ serviceKey: k });
      cacheClear(); memo = null;
      return send(res, 200, { ok: true });
    }

    // 화면에서 저장한 알림 조건을 watch.json에 쓴다. autosync가 곧 GitHub로 올린다.
    if (p === '/api/watch' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return send(res, 400, { error: '잘못된 형식입니다.' });
      const current = JSON.parse(fs.readFileSync(WATCH, 'utf8'));
      const next = { ...current, ...body };
      fs.writeFileSync(WATCH, JSON.stringify(next, null, 2) + '\n');
      log('알림 조건을 watch.json에 저장했습니다.');
      return send(res, 200, { ok: true, watch: next });
    }

    if (p === '/api/listings') {
      const key = getServiceKey();
      if (!key) return send(res, 428, { error: 'NO_KEY' });
      const r = url.searchParams.get('refresh');
      const data = await getData(key, { refresh: r === '1' || r === 'full', hard: r === 'full' });
      const errors = [...data.errors];
      if (state.cmpetBlocked) errors.push('경쟁률·당첨가점은 별도 API입니다 — 공공데이터포털에서 “청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스”도 활용신청해 주세요.');
      return send(res, 200, {
        fetchedAt: data.fetchedAt, autoRefreshMinutes: AUTO_REFRESH_MS / 60000,
        corners: CORNERS,
        incomeStandard: data.incomeStandard,
        watch: JSON.parse(fs.readFileSync(WATCH, 'utf8')),
        sources: sourceStatus(data),
        errors, enriching, progress: enrichProgress, listings: data.listings,
      });
    }

    if (p === '/api/listing') {
      const key = getServiceKey();
      if (!key) return send(res, 428, { error: 'NO_KEY' });
      const data = memo || (await getData(key));
      const l = data.listings.find((x) => x.id === url.searchParams.get('id'));
      if (!l) return send(res, 404, { error: '공고를 찾을 수 없습니다.' });
      Object.assign(l, await enrich(key, l, { withCmpet: true }));
      return send(res, 200, l);
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });
    return serveStatic(req, res);
  } catch (e) {
    log('ERROR', e.stack || e.message);
    return send(res, e instanceof ApplyHomeError ? 502 : 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  서울 청약 대시보드  →  http://localhost:${PORT}\n`);
  if (!getServiceKey()) console.log('  ⚠︎ 인증키가 아직 없습니다. 브라우저 첫 화면에서 등록하세요.\n');
});
