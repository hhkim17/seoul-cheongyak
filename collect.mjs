// 공고 수집 · 상세 보강 — 로컬 서버(server.mjs)와 정적 빌드(build.mjs)가 함께 쓴다.

import { api } from './api.mjs';
import * as LH from './lh.mjs';
import { myhome } from './myhome.mjs';
import { isTransient } from './net.mjs';
import { extractCriteria } from './criteria.mjs';
import { scrapeSh, scrapeHug, scrapeIncomeStandard, scrapeMedianIncome } from './scrape.mjs';
import * as N from './normalize.mjs';
import { cacheGet, cacheSet } from './store.mjs';

export const LIST_TTL = 10 * 60 * 1000;
export const DETAIL_TTL = 6 * 60 * 60 * 1000;
export const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 540);

export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

export function daysAgoISO(d) {
  return new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
}

// 공급지역명이 있으면 그것만 믿는다. 공급위치 주소에는 지구 경계 설명으로
// 타 시·도 공고에도 '서울특별시 OO구'가 섞여 들어오기 때문.
const isSeoul = (row) => {
  const area = String(row.SUBSCRPT_AREA_CODE_NM || '').trim();
  if (area) return area.includes('서울');
  return String(row.HSSPLY_ADRES || '').trim().startsWith('서울');
};

async function section(label, fn, normalize, retry) {
  try {
    const rows = await fn();
    const out = rows.filter(isSeoul).map(normalize);
    log(`  ${label}: 전국 ${rows.length}건 → 서울 ${out.length}건`);
    return { rows: out, error: null };
  } catch (e) {
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

/** LH는 청약홈과 응답 구조가 완전히 달라 따로 다룬다 */
async function lhSection(key) {
  try {
    const rows = await LH.lhNotices(key, { months: 14 });
    const out = rows.map(N.normalizeLh);
    log(`  LH: ${out.length}건`);
    return { rows: out, error: null, blocked: false };
  } catch (e) {
    const blocked = e.code === 'NOT_REGISTERED';
    log(`  LH: ${blocked ? '활용신청 필요' : `실패 — ${e.message}`}`);
    return {
      rows: [],
      blocked,
      error: blocked
        ? 'LH 임대·분양(행복주택·국민임대 등)은 아직 안 나옵니다 — 공공데이터포털에서 “한국토지주택공사_분양임대공고문 조회 서비스” 활용신청이 필요합니다.'
        : isTransient(e)
          ? 'LH 공고를 이번에는 못 가져왔습니다 (공공데이터포털 접속 불안정). 다음 갱신 때 자동으로 다시 시도합니다.'
          : `LH 조회 실패: ${e.message}`,
    };
  }
}

/** 마이홈포털 통합 공고 — SH·지방공사 물량이 여기로 들어온다 */
async function myhomeSection(key) {
  const grab = async (label, fn, kindHint) => {
    const rows = (await fn()).filter(N.myhomeIsSeoul).map((r) => N.normalizeMyhome(r, kindHint));
    log(`  마이홈 ${label}: 서울 ${rows.length}건`);
    return rows;
  };
  try {
    const [rent, sale] = await Promise.all([
      grab('공공임대', () => myhome.rentNotices(key), 'MYHOME_RENT'),
      grab('공공분양', () => myhome.saleNotices(key), 'MYHOME_SALE'),
    ]);
    return { rows: [...rent, ...sale], error: null, blocked: false };
  } catch (e) {
    const blocked = e.code === 'NOT_REGISTERED';
    log(`  마이홈: ${blocked ? '활용신청 필요' : `실패 — ${e.message}`}`);
    return {
      rows: [],
      blocked,
      error: blocked
        ? 'SH·지방공사 공고(공공임대·공공분양)는 아직 안 나옵니다 — 공공데이터포털에서 “국토교통부_마이홈포털 공공주택 모집공고 조회 서비스” 활용신청이 필요합니다.'
        : isTransient(e)
          ? '마이홈포털 공고를 이번에는 못 가져왔습니다 (공공데이터포털 접속 불안정). 다음 갱신 때 자동으로 다시 시도합니다.'
          : `마이홈포털 조회 실패: ${e.message}`,
    };
  }
}

/** SH·HUG는 Open API가 없어 공개 게시판을 읽는다. 실패해도 나머지는 그대로 돈다. */
async function scrapeSection() {
  const run = async (label, fn, norm) => {
    try {
      const rows = (await fn()).map(norm);
      log(`  ${label}: ${rows.length}건`);
      return { rows, error: null };
    } catch (e) {
      log(`  ${label}: 실패 — ${e.message}`);
      return { rows: [], error: `${label} 수집 실패(게시판 구조가 바뀌었을 수 있습니다): ${e.message}` };
    }
  };
  const [sh, hug] = await Promise.all([
    run('SH 공고게시판', () => scrapeSh({ pages: 6, periodLimit: 20 }), N.normalizeSh),
    run('HUG 든든전세', () => scrapeHug(), N.normalizeHug),
  ]);
  return {
    rows: [...sh.rows, ...hug.rows],
    error: [sh.error, hug.error].filter(Boolean).join(' | ') || null,
    ok: { sh: !sh.error, hug: !hug.error },
  };
}

export async function collectListings(key) {
  const since = daysAgoISO(LOOKBACK_DAYS);
  const sinceCompact = since.replace(/-/g, '');
  log(`공고 수집 시작 (모집공고일 ${since} 이후)`);

  const [apt, remndr, urbty, rent, lh, mh, scraped] = await Promise.all([
    section('아파트', () => api.aptList(key, since), N.normalizeApt, () => api.aptList(key, sinceCompact)),
    section('무순위/잔여세대', () => api.remndrList(key, since), N.normalizeRemndr, () => api.remndrList(key, sinceCompact)),
    section('오피스텔·도시형·생숙', () => api.urbtyList(key, since), N.normalizeUrbty, () => api.urbtyList(key, sinceCompact)),
    section('공공지원 민간임대', () => api.pblPvtRentList(key, sinceCompact), N.normalizeRent, () => api.pblPvtRentList(key, since)),
    lhSection(key),
    myhomeSection(key),
    scrapeSection(),
  ]);

  // 소득 기준표는 매년 바뀐다 — 코드에 박지 않고 공표 페이지에서 읽어 스냅샷에 싣는다
  const standards = {};
  for (const [key, label, fn] of [['urban', '도시근로자', scrapeIncomeStandard], ['median', '기준 중위소득', scrapeMedianIncome]]) {
    try {
      standards[key] = await fn();
      log(`  ${label} 기준표: ${standards[key].year}년 (${Object.keys(standards[key].base).length}개 가구원수)`);
    } catch (e) {
      log(`  ${label} 기준표: 실패 — ${e.message}`);
    }
  }

  const parts = [apt, remndr, urbty, rent, lh, mh, scraped];
  const all = parts.flatMap((r) => r.rows);
  const errors = parts.map((r) => r.error).filter(Boolean);

  const seen = new Map();
  for (const l of all) if (!seen.has(l.id)) seen.set(l.id, l);

  // 정정공고가 원공고와 함께 내려오는 경우가 있다 — 같은 공고면 최신 것만 남긴다
  const titleKey = (l) =>
    `${l.kind}|${String(l.name).replace(/\[?\s*정정\s*공고\s*\]?/g, '').replace(/\s+/g, '')}`;
  const byTitle = new Map();
  for (const l of seen.values()) {
    const k = titleKey(l);
    const prev = byTitle.get(k);
    if (!prev || (l.noticeDate || '') > (prev.noticeDate || '')) byTitle.set(k, l);
  }

  const listings = [...byTitle.values()]
    .map((l) => ({ ...l, corner: N.cornerOf(l), agency: N.agencyOf(l) }))
    .sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || ''));

  log(`수집 완료: 서울 ${listings.length}건`);
  return { listings, errors, lhBlocked: lh.blocked, myhomeBlocked: mh.blocked, scrapeOk: scraped.ok, standards, fetchedAt: Date.now() };
}

// ── 단지별 상세 보강 ────────────────────────────────────────────────
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

const isLh = (kind) => kind.startsWith('LH_');
const isMyhome = (kind) => kind.startsWith('MYHOME_');

export const state = { cmpetBlocked: false };

/** 이 앱이 쓰는 공공데이터포털 API 목록 — 화면의 “데이터 연결 상태”에 그대로 쓰인다 */
export const DATA_SOURCES = [
  { id: 'applyhome-detail', org: '한국부동산원', name: '청약홈 분양정보 조회 서비스',
    use: '아파트·무순위·오피스텔·공공지원임대 공고와 주택형·분양가',
    url: 'https://www.data.go.kr/data/15098547/openapi.do', required: true },
  { id: 'applyhome-cmpet', org: '한국부동산원', name: '청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스',
    use: '경쟁률·당첨가점·특별공급 신청현황',
    url: 'https://www.data.go.kr/data/15098905/openapi.do', required: true },
  { id: 'lh-notice', org: '한국토지주택공사', name: 'LH 분양임대공고문 조회 서비스',
    use: '행복주택·국민임대·영구임대·매입/전세임대 등 LH 공고 목록',
    url: 'https://www.data.go.kr/data/15058530/openapi.do' },
  { id: 'lh-supply', org: '한국토지주택공사', name: 'LH 분양임대공고별 공급정보 조회 서비스',
    use: 'LH 공고의 주택형·세대수·임대조건',
    url: 'https://www.data.go.kr/data/15056765/openapi.do' },
  { id: 'lh-detail', org: '한국토지주택공사', name: 'LH 분양임대공고별 상세정보 조회 서비스',
    use: 'LH 공고문 첨부파일(PDF/HWP)',
    url: 'https://www.data.go.kr/data/15057999/openapi.do' },
  { id: 'myhome', org: '국토교통부', name: '마이홈포털 공공주택 모집공고 조회 서비스',
    use: 'SH·지방공사를 포함한 공공임대·공공분양 통합 공고',
    url: 'https://www.data.go.kr/data/15108420/openapi.do' },
  { id: 'sh-board', org: 'SH 서울주택도시공사', name: 'SH 공고 게시판 (직접 수집)', scraped: true,
    use: '장기전세·청년안심주택·매입임대·미리내집 등 SH 공고. Open API가 없어 공개 게시판을 읽습니다.',
    url: 'https://www.i-sh.co.kr/main/lay2/program/S1T1637C1639/www/brd/m_247/list.do' },
  { id: 'hug-board', org: 'HUG 주택도시보증공사', name: 'HUG 든든전세 모집공고 (직접 수집)', scraped: true,
    use: '든든전세주택 모집 물량. Open API가 없어 공개 페이지를 읽습니다.',
    url: 'https://www.khug.or.kr/jeonse/web/s07/s070102.jsp' },
];

/** 수집 결과로부터 각 API가 지금 붙어 있는지 판정한다 */
export function sourceStatus({ lhBlocked, myhomeBlocked, scrapeOk = {} }) {
  return DATA_SOURCES.map((s) => {
    let ok = true;
    if (s.id === 'sh-board') ok = scrapeOk.sh !== false;
    if (s.id === 'hug-board') ok = scrapeOk.hug !== false;
    if (s.id === 'applyhome-cmpet') ok = !state.cmpetBlocked;
    if (s.id.startsWith('lh-')) ok = !lhBlocked;
    if (s.id === 'myhome') ok = !myhomeBlocked;
    return { ...s, ok };
  });
}

export async function enrich(key, listing, { withCmpet }) {
  const { houseManageNo: h, pblancNo: p, kind } = listing;
  const cacheKey = `enrich_${listing.id}`;
  const hit = cacheGet(cacheKey, DETAIL_TTL);
  if (hit) return hit.value;

  const out = { models: [], cmpet: null, score: null, spsply: null, attachments: [] };

  // 마이홈 통합 공고는 목록 자체가 전부다. 상세는 공고 원문 링크로 넘긴다.
  // 마이홈·SH·HUG는 목록이 곧 전부다. 상세는 공고 원문 링크로 넘긴다.
  if (isMyhome(kind) || kind === 'SH' || kind === 'HUG') {
    if (listing.models?.length) out.models = listing.models;
    cacheSet(cacheKey, out); return out;
  }

  if (isLh(kind)) {
    const args = {
      panId: listing.panId, uppCd: listing.uppCd, aisTpCd: listing.aisTpCd,
      splInfTpCd: listing.splInfTpCd, ccrCd: listing.ccrCd,
    };
    // 공급정보: 주택형·전용면적·세대수·임대조건
    try {
      const json = await LH.lhSupplyRaw(key, args);
      out.models = LH.pickArray(json, LH.isSupplyRow).map(N.normalizeLhModel);
    } catch (e) { out.modelError = e.message; }

    // 상세: 청약 일정과 첨부 공고문. 목록에는 일정이 없어 여기서 채운다.
    try {
      const json = await LH.lhDetailRaw(key, args);
      const sched = LH.pickArray(json, LH.isScheduleRow);
      if (sched.length) {
        const s = N.lhScheduleOf(sched);
        Object.assign(out, {
          receiptStart: s.receiptStart, receiptEnd: s.receiptEnd,
          rank1Start: s.receiptStart, rank1End: s.receiptEnd,
          resultDate: s.resultDate,
          contractStart: s.contractStart, contractEnd: s.contractEnd,
          docStart: s.docStart, docEnd: s.docEnd,
          acceptNote: s.acceptNote,
          scheduleUnknown: !s.receiptStart,
        });
      }
      out.attachments = N.lhFilesOf(LH.pickArray(json, LH.isFileRow));
      // 상세 응답의 안내문에 소득·자산 기준이 적혀 있는 경우가 있다
      const c = extractCriteria(JSON.stringify(json));
      if (c) out.criteria = { ...c, from: 'LH 공고 상세' };
      const complex = LH.pickArray(json, LH.isComplexRow)[0];
      if (complex) {
        out.address = [complex.LGDN_ADR, complex.LGDN_DTL_ADR].filter(Boolean).join(' ').trim();
        out.gu = N.guFromAddress(out.address) || listing.gu;
        out.moveIn = String(complex.MVIN_XPC_YM ?? '');
      }
    } catch { /* 상세가 없는 공고도 있다 */ }

    cacheSet(cacheKey, out);
    return out;
  }

  const mf = MODEL_FETCHERS[kind];
  if (mf) {
    try { out.models = (await mf.models(key, h, p)).map(mf.norm); }
    catch (e) { out.modelError = e.message; }
  }

  if (withCmpet) {
    const cf = CMPET_FETCHERS[kind];
    if (cf) {
      try { out.cmpet = await cf(key, h, p); }
      catch (e) { out.cmpetError = e.message; if (e.status === 401) state.cmpetBlocked = true; }
    }
    if (kind === 'APT') {
      try { out.score = await api.aptScore(key, h, p); } catch { /* 가점 미공개 */ }
      try { out.spsply = await api.aptSpsply(key, h, p); } catch { /* 특공 현황 미공개 */ }
    }
  }

  cacheSet(cacheKey, out);
  return out;
}

/** 동시 요청 수를 제한하며 순회 */
export async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { await worker(item); } catch { /* 개별 실패는 무시 */ }
    }
  });
  await Promise.all(runners);
}

/** 접수가 끝난 공고만 경쟁률이 존재한다 */
export function isClosed(l, today = new Date().toISOString().slice(0, 10)) {
  return !!(l.receiptEnd && l.receiptEnd < today) || !!(l.rank1End && l.rank1End < today);
}

export async function enrichMany(key, targets, onProgress) {
  let done = 0;
  await pool(targets, 4, async (l) => {
    const e = await enrich(key, l, { withCmpet: isClosed(l) });
    Object.assign(l, e);
    onProgress?.(++done, targets.length);
  });
}
