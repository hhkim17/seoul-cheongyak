#!/usr/bin/env node
// 서울 청약 대시보드 — 로컬 서버
// 공공데이터포털 인증키를 서버가 쥐고 청약홈 OpenAPI를 프록시한다(브라우저 CORS 회피 + 키 노출 방지).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api, ApplyHomeError } from './api.mjs';
import * as N from './normalize.mjs';
import { getServiceKey, writeConfig, cacheGet, cacheSet, cacheClear, cacheDelete } from './store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 5173);

const LIST_TTL = 10 * 60 * 1000;        // 공고 목록 10분
const DETAIL_TTL = 6 * 60 * 60 * 1000;  // 주택형/경쟁률 6시간
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 540);
const AUTO_REFRESH_MS = Number(process.env.AUTO_REFRESH_MINUTES || 30) * 60000; // 서버 자동 갱신 주기

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function daysAgoISO(d) {
  const t = new Date(Date.now() - d * 86400000);
  return t.toISOString().slice(0, 10);
}

// ── 목록 수집 ────────────────────────────────────────────────────────
// 공급지역명이 있으면 그것만 믿는다. 공급위치 주소에는 지구 경계 설명으로
// 타 시·도 공고에도 '서울특별시 OO구'가 섞여 들어오기 때문.
const isSeoul = (row) => {
  const area = String(row.SUBSCRPT_AREA_CODE_NM || '').trim();
  if (area) return area.includes('서울');
  return String(row.HSSPLY_ADRES || '').trim().startsWith('서울');
};

async function fetchSection(label, fn, normalize, retry) {
  try {
    const rows = await fn();
    const out = rows.filter(isSeoul).map(normalize);
    log(`  ${label}: 전국 ${rows.length}건 → 서울 ${out.length}건`);
    return { rows: out, error: null };
  } catch (e) {
    // 모집공고일 필터를 서버가 거부하는 경우가 있어 필터 없이 한 번 더 시도한다
    if (retry) {
      log(`  ${label}: 날짜 필터 실패, 전체 조회로 재시도 — ${e.message}`);
      try {
        const rows = await retry();
        const out = rows.filter(isSeoul).map(normalize);
        log(`  ${label}: 전국 ${rows.length}건 → 서울 ${out.length}건 (재시도)`);
        return { rows: out, error: null };
      } catch (e2) { e = e2; }
    }
    log(`  ${label}: 실패 — ${e.message}`);
    return { rows: [], error: `${label} 조회 실패: ${e.message}` };
  }
}

async function collectListings(key) {
  const since = daysAgoISO(LOOKBACK_DAYS);
  const sinceCompact = since.replace(/-/g, '');
  log(`공고 수집 시작 (모집공고일 ${since} 이후)`);

  const results = await Promise.all([
    fetchSection('아파트', () => api.aptList(key, since), N.normalizeApt, () => api.aptList(key, sinceCompact)),
    fetchSection('무순위/잔여세대', () => api.remndrList(key, since), N.normalizeRemndr, () => api.remndrList(key, sinceCompact)),
    fetchSection('오피스텔·도시형·생숙', () => api.urbtyList(key, since), N.normalizeUrbty, () => api.urbtyList(key, sinceCompact)),
    fetchSection('공공지원 민간임대', () => api.pblPvtRentList(key, sinceCompact), N.normalizeRent, () => api.pblPvtRentList(key, since)),
  ]);

  const listings = results.flatMap((r) => r.rows);
  const errors = results.map((r) => r.error).filter(Boolean);

  // 같은 단지 중복 공고 제거(주택관리번호+공고번호 기준)
  const seen = new Map();
  for (const l of listings) if (!seen.has(l.id)) seen.set(l.id, l);
  const unique = [...seen.values()].sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || ''));

  log(`수집 완료: 서울 ${unique.length}건`);
  return { listings: unique, errors, fetchedAt: Date.now() };
}

// ── 단지별 상세 보강(주택형·분양가·경쟁률·당첨가점) ──────────────────
const MODEL_FETCHERS = {
  APT: { models: api.aptModels, norm: N.normalizeAptModel },
  REMNDR: { models: api.remndrModels, norm: N.normalizeSimpleModel },
  URBTY: { models: api.urbtyModels, norm: N.normalizeUrbtyModel },
  RENT: { models: api.pblPvtRentModels, norm: N.normalizeSimpleModel },
};

const CMPET_FETCHERS = {
  APT: api.aptCmpet,
  REMNDR: api.remndrCmpet,
  URBTY: api.urbtyCmpet,
  RENT: api.pblPvtRentCmpet,
};

async function enrich(key, listing, { withCmpet }) {
  const { houseManageNo: h, pblancNo: p, kind } = listing;
  const cacheKey = `enrich_${listing.id}`;
  const hit = cacheGet(cacheKey, DETAIL_TTL);
  if (hit) return hit.value;

  const out = { models: [], cmpet: null, score: null, spsply: null };

  const mf = MODEL_FETCHERS[kind];
  if (mf) {
    try {
      const raw = await mf.models(key, h, p);
      out.models = raw.map(mf.norm);
    } catch (e) { out.modelError = e.message; }
  }

  if (withCmpet) {
    const cf = CMPET_FETCHERS[kind];
    if (cf) {
      try { out.cmpet = await cf(key, h, p); }
      catch (e) { out.cmpetError = e.message; if (e.status === 401) cmpetBlocked = true; }
    }
    if (kind === 'APT') {
      try { out.score = await api.aptScore(key, h, p); } catch { /* 가점 미공개 단지 */ }
      try { out.spsply = await api.aptSpsply(key, h, p); } catch { /* 특공 현황 미공개 */ }
    }
  }

  cacheSet(cacheKey, out);
  return out;
}

/** 동시 요청 수를 제한하며 순회 */
async function pool(items, limit, worker) {
  const queue = [...items.entries()];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const [i, item] = queue.shift();
      try { await worker(item, i); } catch { /* 개별 실패는 무시 */ }
    }
  });
  await Promise.all(runners);
}

let enriching = false;
let enrichProgress = { done: 0, total: 0 };
let cmpetBlocked = false; // 경쟁률 서비스 활용신청이 아직 안 된 경우

async function enrichAll(key, targets) {
  if (enriching || !targets.length) return;
  enriching = true;
  const today = new Date().toISOString().slice(0, 10);
  enrichProgress = { done: 0, total: targets.length };
  log(`상세 보강 시작 (${targets.length}건)`);
  await pool(targets, 4, async (l) => {
    // 접수가 끝난 공고만 경쟁률이 존재한다
    const closed = !!(l.receiptEnd && l.receiptEnd < today) || !!(l.rank1End && l.rank1End < today);
    const e = await enrich(key, l, { withCmpet: closed });
    Object.assign(l, e);
    enrichProgress.done++;
  });
  log('상세 보강 완료');
  enriching = false;
}

// ── 데이터 진입점 ────────────────────────────────────────────────────
let memo = null;
let lastAutoRefresh = null;

/**
 * refresh: 공고 목록만 다시 받는다(상세 캐시는 유지 — 빠르고 호출량이 적다)
 * hard:    캐시를 전부 비우고 처음부터 다시 받는다
 */
async function getData(key, { refresh = false, hard = false } = {}) {
  if (hard) { cacheClear(); memo = null; }
  else if (refresh) { cacheDelete('listings'); memo = null; }

  const cached = cacheGet('listings', LIST_TTL);
  let data;
  if (cached) {
    data = cached.value;
  } else {
    data = await collectListings(key);
    cacheSet('listings', data);
  }

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
    try {
      await getData(key, { refresh: true });
      lastAutoRefresh = Date.now();
      log('자동 갱신 완료');
    } catch (e) {
      log('자동 갱신 실패 —', e.message);
    }
  }, AUTO_REFRESH_MS);
}

// ── HTTP ─────────────────────────────────────────────────────────────
function send(res, status, body, type = 'application/json; charset=utf-8') {
  const payload = type.startsWith('application/json') ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(payload);
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
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
      const key = getServiceKey();
      return send(res, 200, {
        hasKey: !!key,
        enriching,
        progress: enrichProgress,
        cachedAt: cacheGet('listings')?.savedAt ?? null,
        lastAutoRefresh,
        autoRefreshMinutes: AUTO_REFRESH_MS / 60000,
      });
    }

    if (p === '/api/key' && req.method === 'POST') {
      const { serviceKey } = await readBody(req);
      const k = String(serviceKey || '').trim();
      if (!k) return send(res, 400, { error: '인증키를 입력해 주세요.' });
      try {
        await api.ping(k);
      } catch (e) {
        const hint = e.status === 401
          ? '인증키가 올바르지 않거나 아직 승인 전입니다. 공공데이터포털에서 “일반 인증키(Decoding)” 값을 그대로 붙여넣었는지 확인해 주세요. (활용신청 직후 최대 1시간 반영 지연)'
          : e.message;
        return send(res, 400, { error: hint, detail: e.body || null });
      }
      writeConfig({ serviceKey: k });
      cacheClear();
      memo = null;
      return send(res, 200, { ok: true });
    }

    if (p === '/api/listings') {
      const key = getServiceKey();
      if (!key) return send(res, 428, { error: 'NO_KEY' });
      const r = url.searchParams.get('refresh');
      const data = await getData(key, { refresh: r === '1' || r === 'full', hard: r === 'full' });
      const errors = [...data.errors];
      if (cmpetBlocked) errors.push('경쟁률·당첨가점은 별도 API입니다 — 공공데이터포털에서 “청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스”도 활용신청해 주세요.');
      return send(res, 200, {
        fetchedAt: data.fetchedAt,
        autoRefreshMinutes: AUTO_REFRESH_MS / 60000,
        errors,
        enriching,
        progress: enrichProgress,
        listings: data.listings,
      });
    }

    if (p === '/api/listing') {
      const key = getServiceKey();
      if (!key) return send(res, 428, { error: 'NO_KEY' });
      const id = url.searchParams.get('id');
      const data = memo || (await getData(key));
      const l = data.listings.find((x) => x.id === id);
      if (!l) return send(res, 404, { error: '공고를 찾을 수 없습니다.' });
      const e = await enrich(key, l, { withCmpet: true });
      Object.assign(l, e);
      return send(res, 200, l);
    }

    if (p.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });

    return serveStatic(req, res);
  } catch (e) {
    log('ERROR', e.stack || e.message);
    const status = e instanceof ApplyHomeError ? 502 : 500;
    return send(res, status, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  서울 청약 대시보드  →  http://localhost:${PORT}\n`);
  if (!getServiceKey()) {
    console.log('  ⚠︎ 공공데이터포털 인증키가 아직 없습니다. 브라우저 첫 화면에서 등록하세요.\n');
  }
});
