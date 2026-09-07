// 한국토지주택공사(LH) 분양·임대 공고 API 클라이언트
// 분양임대공고문   https://www.data.go.kr/data/15058530/openapi.do
// 공고별 공급정보  https://www.data.go.kr/data/15056765/openapi.do
// 공고별 상세정보  https://www.data.go.kr/data/15057999/openapi.do
// ※ 청약홈과 인증키는 같지만 활용신청은 API마다 따로 해야 한다.

const B = 'https://apis.data.go.kr/B552555';

/** 상위 공고유형 코드 */
export const LH_UPP = {
  '05': '분양주택',
  '06': '임대주택',
  '13': '주거복지',
  '39': '신혼희망타운',
};

export const SEOUL_CNP_CD = '11'; // 지역코드: 서울

export class LhError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

/**
 * LH 오픈API는 [{resHeader...},{dsList:[...]}] 형태로 오거나 단일 객체로 오는 등
 * 응답 껍데기가 일정하지 않다. 레코드 배열만 찾아서 꺼낸다.
 */
function extractRows(json) {
  const found = [];
  const looksLikeRow = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
    ('PAN_ID' in o || 'PAN_NM' in o || 'AIS_TP_CD_NM' in o || 'SPL_INF_TP_CD' in o || 'HSH_NM' in o);

  const walk = (node) => {
    if (Array.isArray(node)) {
      if (node.some(looksLikeRow)) found.push(...node.filter(looksLikeRow));
      else node.forEach(walk);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
    }
  };
  walk(json);
  return found;
}

/** 응답 껍데기에서 에러 메시지를 찾아낸다 */
function findError(json, text) {
  const s = JSON.stringify(json ?? '');
  if (/SERVICE_KEY_IS_NOT_REGISTERED/.test(s) || /SERVICE_KEY_IS_NOT_REGISTERED/.test(text)) {
    return new LhError('LH API 활용신청이 안 돼 있습니다.', 'NOT_REGISTERED');
  }
  const m = s.match(/"(?:errMsg|returnAuthMsg|resultMsg)"\s*:\s*"([^"]+)"/);
  if (m && !/정상|NORMAL|SUCCESS/i.test(m[1])) return new LhError(m[1], 'API_ERROR');
  return null;
}

async function call(path, serviceKey, params) {
  const qs = new URLSearchParams(params);
  const url = `${B}/${path}?${qs}&serviceKey=${encodeURIComponent(serviceKey)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();

  let json = null;
  try { json = JSON.parse(text); } catch { /* XML 에러 응답 */ }
  const err = findError(json, text);
  if (err) throw err;
  if (!json) throw new LhError(`응답을 해석할 수 없습니다: ${text.slice(0, 200)}`, 'PARSE');
  if (!res.ok) throw new LhError(`HTTP ${res.status}`, 'HTTP');
  return json;
}

/** 공고 목록. uppCd 미지정이면 분양·임대·주거복지·신혼희망타운을 모두 훑는다. */
export async function lhNotices(serviceKey, { from, to, cnpCd = SEOUL_CNP_CD, uppCodes = Object.keys(LH_UPP), perPage = 100, maxPages = 5 } = {}) {
  const out = [];
  for (const upp of uppCodes) {
    for (let page = 1; page <= maxPages; page++) {
      const json = await call('lhLeaseNoticeInfo1/lhLeaseNoticeInfo1', serviceKey, {
        PG_SZ: String(perPage), PAGE: String(page),
        UPP_AIS_TP_CD: upp, CNP_CD: cnpCd,
        PAN_NT_ST_DT: from, CLSG_DT: to,
      });
      const rows = extractRows(json).filter((r) => r.PAN_ID || r.PAN_NM);
      out.push(...rows.map((r) => ({ ...r, UPP_AIS_TP_CD: r.UPP_AIS_TP_CD || upp })));
      if (rows.length < perPage) break;
    }
  }
  return out;
}

/** 공고별 공급정보(주택형·세대수·임대조건) */
export async function lhSupply(serviceKey, { panId, uppCd, aisTpCd, splInfTpCd = '050', ccrCd = '01' }) {
  const json = await call('lhLeaseNoticeSplInfo1/getLeaseNoticeSplInfo1', serviceKey, {
    SPL_INF_TP_CD: splInfTpCd, CCR_CNNT_SYS_DS_CD: ccrCd,
    PAN_ID: panId, UPP_AIS_TP_CD: uppCd, ...(aisTpCd ? { AIS_TP_CD: aisTpCd } : {}),
  });
  return extractRows(json);
}

/** 공고별 상세정보(첨부파일·문의처 등) */
export async function lhDetail(serviceKey, { panId, uppCd, aisTpCd, splInfTpCd = '010', ccrCd = '01' }) {
  const json = await call('lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1', serviceKey, {
    SPL_INF_TP_CD: splInfTpCd, CCR_CNNT_SYS_DS_CD: ccrCd,
    PAN_ID: panId, UPP_AIS_TP_CD: uppCd, ...(aisTpCd ? { AIS_TP_CD: aisTpCd } : {}),
  });
  return { rows: extractRows(json), raw: json };
}
