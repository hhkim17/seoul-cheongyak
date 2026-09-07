// 공공데이터포털 · 한국부동산원 청약홈 OpenAPI 클라이언트
// 스펙 출처: https://infuser.odcloud.kr/api/stages/37000/api-docs (분양정보)
//            https://infuser.odcloud.kr/oas/docs?namespace=ApplyhomeInfoCmpetRtSvc/v1 (경쟁률)

const BASE = 'https://api.odcloud.kr/api';
const DETAIL = `${BASE}/ApplyhomeInfoDetailSvc/v1`;
const CMPET = `${BASE}/ApplyhomeInfoCmpetRtSvc/v1`;

export class ApplyHomeError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// 포털은 Decoding 키(원문)와 Encoding 키(퍼센트 인코딩된 값)를 함께 보여준다.
// 어느 쪽을 붙여넣어도 동작하도록, 이미 인코딩된 형태면 그대로 쓴다.
function keyParam(serviceKey) {
  const k = String(serviceKey).trim();
  return /%[0-9A-Fa-f]{2}/.test(k) ? k : encodeURIComponent(k);
}

async function call(url, serviceKey, params = {}) {
  const qs = new URLSearchParams({ page: '1', perPage: '100', returnType: 'JSON', ...params });
  const full = `${url}?${qs.toString()}&serviceKey=${keyParam(serviceKey)}`;
  const res = await fetch(full, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* XML 에러 응답 */ }

  if (!res.ok) {
    const msg = json?.message || json?.resultMsg || text.slice(0, 300);
    throw new ApplyHomeError(`API ${res.status}: ${msg}`, res.status, text.slice(0, 800));
  }
  if (!json) throw new ApplyHomeError('JSON 파싱 실패', res.status, text.slice(0, 800));
  return json;
}

// perPage 상한(1000)을 넘는 결과까지 자동 페이징
async function callAll(url, serviceKey, params = {}, { maxPages = 12, perPage = 1000 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const json = await call(url, serviceKey, { ...params, page: String(page), perPage: String(perPage) });
    const rows = json.data || [];
    out.push(...rows);
    const total = json.totalCount ?? out.length;
    if (out.length >= total || rows.length === 0) break;
  }
  return out;
}

export const api = {
  /** 인증키 검증용 최소 호출 */
  async ping(serviceKey) {
    const json = await call(`${DETAIL}/getAPTLttotPblancDetail`, serviceKey, { perPage: '1' });
    return { ok: true, totalCount: json.totalCount ?? null };
  },

  // ── 분양정보(공고 목록) ───────────────────────────────────────────
  aptList: (key, since) =>
    callAll(`${DETAIL}/getAPTLttotPblancDetail`, key, { 'cond[RCRIT_PBLANC_DE::GTE]': since }),

  remndrList: (key, since) =>
    callAll(`${DETAIL}/getRemndrLttotPblancDetail`, key, { 'cond[RCRIT_PBLANC_DE::GTE]': since }),

  urbtyList: (key, since) =>
    callAll(`${DETAIL}/getUrbtyOfctlLttotPblancDetail`, key, { 'cond[RCRIT_PBLANC_DE::GTE]': since }),

  // 공공지원 민간임대는 모집공고일 포맷이 YYYYMMDD
  pblPvtRentList: (key, sinceCompact) =>
    callAll(`${DETAIL}/getPblPvtRentLttotPblancDetail`, key, { 'cond[RCRIT_PBLANC_DE::GTE]': sinceCompact }),

  // ── 주택형별 상세(면적·세대수·분양가) ─────────────────────────────
  aptModels: (key, h, p) =>
    callAll(`${DETAIL}/getAPTLttotPblancMdl`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  remndrModels: (key, h, p) =>
    callAll(`${DETAIL}/getRemndrLttotPblancMdl`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  urbtyModels: (key, h, p) =>
    callAll(`${DETAIL}/getUrbtyOfctlLttotPblancMdl`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  pblPvtRentModels: (key, h, p) =>
    callAll(`${DETAIL}/getPblPvtRentLttotPblancMdl`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  // ── 경쟁률 · 당첨가점 · 특별공급 신청현황 ──────────────────────────
  aptCmpet: (key, h, p) =>
    callAll(`${CMPET}/getAPTLttotPblancCmpet`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 3, perPage: 500 }),

  aptScore: (key, h, p) =>
    callAll(`${CMPET}/getAptLttotPblancScore`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 500 }),

  aptSpsply: (key, h, p) =>
    callAll(`${CMPET}/getAPTSpsplyReqstStus`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  remndrCmpet: (key, h, p) =>
    callAll(`${CMPET}/getRemndrLttotPblancCmpet`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  urbtyCmpet: (key, h, p) =>
    callAll(`${CMPET}/getUrbtyOfctlLttotPblancCmpet`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),

  pblPvtRentCmpet: (key, h, p) =>
    callAll(`${CMPET}/getPblPvtRentLttotPblancCmpet`, key, { 'cond[HOUSE_MANAGE_NO::EQ]': h, 'cond[PBLANC_NO::EQ]': p }, { maxPages: 2, perPage: 200 }),
};
