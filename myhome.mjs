// 국토교통부 마이홈포털 공공주택 모집공고 API
// https://www.data.go.kr/data/15108420/openapi.do
//
// LH뿐 아니라 SH·GH·지방공사 공고까지 국토부가 한데 모아 주는 통합 창구다.
// SH는 자체 실시간 공고 API가 없으므로, SH 물량은 이 API를 통해 들어온다.
// 개발계정 하루 1,000건 제한이 있어 호출을 아껴 쓴다.

import { fetchRetry } from './net.mjs';

const BASE = 'https://apis.data.go.kr/1613000/HWSPR02';

export class MyhomeError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/** 응답 껍데기가 items/item 등으로 다양해 레코드 배열만 찾아 꺼낸다 */
function extractRows(json) {
  const out = [];
  const looksLikeRow = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).some((k) => /pblanc|rcrit|ntc|house|suply|inst|brtc/i.test(k));
  const walk = (node) => {
    if (Array.isArray(node)) {
      if (node.some(looksLikeRow)) out.push(...node.filter(looksLikeRow));
      else node.forEach(walk);
    } else if (node && typeof node === 'object') {
      if (looksLikeRow(node) && !Object.values(node).some((v) => Array.isArray(v) || (v && typeof v === 'object'))) out.push(node);
      else Object.values(node).forEach(walk);
    }
  };
  walk(json);
  const seen = new Set();
  return out.filter((r) => { const k = JSON.stringify(r); return seen.has(k) ? false : seen.add(k); });
}

function findError(json, text) {
  const s = JSON.stringify(json ?? '') + text;
  if (/SERVICE_KEY_IS_NOT_REGISTERED/.test(s)) return new MyhomeError('마이홈포털 API 활용신청이 안 돼 있습니다.', 'NOT_REGISTERED');
  if (/NO_OPENAPI_SERVICE_ERROR/.test(s)) return new MyhomeError('엔드포인트를 찾을 수 없습니다.', 'NO_SERVICE');
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/.test(s)) return new MyhomeError('오늘 호출 한도를 다 썼습니다(개발계정 1,000건).', 'QUOTA');
  const m = s.match(/"resultMsg"\s*:\s*"([^"]+)"/);
  if (m && !/정상|NORMAL|SUCCESS|OK/i.test(m[1])) return new MyhomeError(m[1], 'API_ERROR');
  return null;
}

async function call(op, serviceKey, params) {
  const qs = new URLSearchParams({ type: 'json', ...params });
  const res = await fetchRetry(`${BASE}/${op}?${qs}&serviceKey=${encodeURIComponent(serviceKey)}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* XML 에러 */ }
  const err = findError(json, text);
  if (err) throw err;
  if (!json) throw new MyhomeError(`응답을 해석할 수 없습니다: ${text.slice(0, 200)}`, 'PARSE');
  return json;
}

/**
 * 전국 공고가 수백 건 규모라 지역 필터 없이 다 받아 와서 서울만 골라낸다.
 * (지역 파라미터 이름이 문서에 명확치 않아 이 편이 안전하다)
 */
async function listAll(op, serviceKey, { perPage = 500, maxPages = 6 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    let json;
    try {
      json = await call(op, serviceKey, { numOfRows: String(perPage), pageNo: String(page) });
    } catch (e) {
      if (page === 1) throw e;          // 첫 장부터 실패하면 알릴 수밖에 없다
      console.log(`  마이홈: ${page}쪽을 건너뜁니다 — ${e.message}`);
      break;                            // 뒷장이 실패하면 앞장까지만 쓴다
    }
    const body = json?.response?.body;
    const rows = body ? [].concat(body.item ?? []) : extractRows(json);
    out.push(...rows);
    const total = Number(body?.totalCount ?? out.length);
    if (out.length >= total || rows.length === 0) break;
  }
  return out;
}

export const myhome = {
  /** 공공임대: 국민임대·영구임대·행복주택·통합공공임대 */
  rentNotices: (key, opts) => listAll('rsdtRcritNtcList', key, opts),
  /** 공공분양 */
  saleNotices: (key, opts) => listAll('ltRsdtRcritNtcList', key, opts),
};
