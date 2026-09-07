// 청약홈 원본 레코드 → 화면에서 쓰는 단일 스키마로 정규화

export const SEOUL_GU = [
  '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구',
  '동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구',
  '용산구','은평구','종로구','중구','중랑구',
];

const s = (v) => (v == null ? '' : String(v).trim());
const n = (v) => {
  const x = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(x) ? x : null;
};

/** '2026-03-04', '20260304', '2026.03.04' → '2026-03-04' */
export function toISO(v) {
  const t = s(v).replace(/[.\/]/g, '-');
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  return null;
}

export function guFromAddress(addr) {
  const a = s(addr);
  // '서울특별시 OO구'를 먼저 찾는다. 지구 경계 설명에 타 시·도가 섞인 주소가 있어
  // 단순 포함 검색만 하면 엉뚱한 구가 잡힌다.
  const m = a.match(/서울(?:특별시)?\s*([가-힣]{2,4}구)/);
  if (m && SEOUL_GU.includes(m[1])) return m[1];
  return SEOUL_GU.find((g) => a.includes(g)) || null;
}

/** '084.9871A' / '59.9800B' → 84.99 (전용면적) */
export function areaFromHouseType(ty) {
  const m = s(ty).match(/(\d+(?:\.\d+)?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) / 100 : null;
}

export const KIND = {
  APT: { key: 'APT', label: '아파트' },
  REMNDR: { key: 'REMNDR', label: '무순위/잔여세대' },
  URBTY: { key: 'URBTY', label: '오피스텔·도시형·생숙' },
  RENT: { key: 'RENT', label: '공공지원 민간임대' },
};

function base(r, kind) {
  const addr = s(r.HSSPLY_ADRES);
  return {
    kind,
    kindLabel: KIND[kind].label,
    houseManageNo: s(r.HOUSE_MANAGE_NO),
    pblancNo: s(r.PBLANC_NO),
    id: `${kind}:${s(r.HOUSE_MANAGE_NO)}:${s(r.PBLANC_NO)}`,
    name: s(r.HOUSE_NM),
    areaName: s(r.SUBSCRPT_AREA_CODE_NM),
    address: addr,
    gu: guFromAddress(addr),
    totalUnits: n(r.TOT_SUPLY_HSHLDCO),
    noticeDate: toISO(r.RCRIT_PBLANC_DE),
    resultDate: toISO(r.PRZWNER_PRESNATN_DE),
    contractStart: toISO(r.CNTRCT_CNCLS_BGNDE),
    contractEnd: toISO(r.CNTRCT_CNCLS_ENDDE),
    moveIn: s(r.MVN_PREARNGE_YM),
    developer: s(r.BSNS_MBY_NM),
    builder: s(r.CNSTRCT_ENTRPS_NM),
    tel: s(r.MDHS_TELNO),
    homepage: s(r.HMPG_ADRES),
    noticeUrl: s(r.PBLANC_URL),
    subType: s(r.HOUSE_DTL_SECD_NM) || s(r.HOUSE_SECD_NM),
    models: [],
    cmpet: null,
    score: null,
  };
}

export function normalizeApt(r) {
  const b = base(r, 'APT');
  return {
    ...b,
    subType: s(r.HOUSE_DTL_SECD_NM) || s(r.HOUSE_SECD_NM), // 민영 / 국민
    houseSecdName: s(r.HOUSE_SECD_NM),                     // APT / 민간사전청약 / 신혼희망타운
    specialStart: toISO(r.SPSPLY_RCEPT_BGNDE),
    specialEnd: toISO(r.SPSPLY_RCEPT_ENDDE),
    rank1Start: toISO(r.GNRL_RNK1_CRSPAREA_RCPTDE),
    rank1End: toISO(r.GNRL_RNK1_CRSPAREA_ENDDE),
    rank1EtcStart: toISO(r.GNRL_RNK1_ETC_AREA_RCPTDE),
    rank1EtcEnd: toISO(r.GNRL_RNK1_ETC_AREA_ENDDE),
    rank2Start: toISO(r.GNRL_RNK2_CRSPAREA_RCPTDE),
    rank2End: toISO(r.GNRL_RNK2_CRSPAREA_ENDDE),
    receiptStart: toISO(r.RCEPT_BGNDE),
    receiptEnd: toISO(r.RCEPT_ENDDE),
    flags: {
      speculative: s(r.SPECLT_RDN_EARTH_AT) === 'Y',   // 투기과열지구
      regulated: s(r.MDAT_TRGET_AREA_SECD) === 'Y',    // 조정대상지역
      priceCap: s(r.PARCPRC_ULS_AT) === 'Y',           // 분양가상한제
      redevelopment: s(r.IMPRMN_BSNS_AT) === 'Y',      // 정비사업
      publicLand: s(r.PUBLIC_HOUSE_EARTH_AT) === 'Y',  // 공공주택지구
    },
  };
}

export function normalizeRemndr(r) {
  const b = base(r, 'REMNDR');
  return {
    ...b,
    houseSecdName: s(r.HOUSE_SECD_NM), // 무순위 / 불법행위 재공급
    specialStart: toISO(r.SPSPLY_RCEPT_BGNDE),
    specialEnd: toISO(r.SPSPLY_RCEPT_ENDDE),
    receiptStart: toISO(r.SUBSCRPT_RCEPT_BGNDE) || toISO(r.GNRL_RCEPT_BGNDE),
    receiptEnd: toISO(r.SUBSCRPT_RCEPT_ENDDE) || toISO(r.GNRL_RCEPT_ENDDE),
    rank1Start: toISO(r.GNRL_RCEPT_BGNDE),
    rank1End: toISO(r.GNRL_RCEPT_ENDDE),
    flags: {},
  };
}

export function normalizeUrbty(r) {
  const b = base(r, 'URBTY');
  return {
    ...b,
    subType: s(r.HOUSE_DTL_SECD_NM),
    receiptStart: toISO(r.SUBSCRPT_RCEPT_BGNDE),
    receiptEnd: toISO(r.SUBSCRPT_RCEPT_ENDDE),
    rank1Start: toISO(r.SUBSCRPT_RCEPT_BGNDE),
    rank1End: toISO(r.SUBSCRPT_RCEPT_ENDDE),
    flags: {},
  };
}

export function normalizeRent(r) {
  const b = base(r, 'RENT');
  return {
    ...b,
    subType: s(r.HOUSE_SECD_NM) || '공공지원 민간임대',
    receiptStart: toISO(r.SUBSCRPT_RCEPT_BGNDE) || toISO(r.RCEPT_BGNDE),
    receiptEnd: toISO(r.SUBSCRPT_RCEPT_ENDDE) || toISO(r.RCEPT_ENDDE),
    rank1Start: toISO(r.SUBSCRPT_RCEPT_BGNDE) || toISO(r.RCEPT_BGNDE),
    rank1End: toISO(r.SUBSCRPT_RCEPT_ENDDE) || toISO(r.RCEPT_ENDDE),
    flags: {},
  };
}

// ── 주택형(모델) 정규화 ─────────────────────────────────────────────
export function normalizeAptModel(m) {
  const ty = s(m.HOUSE_TY);
  return {
    modelNo: s(m.MODEL_NO),
    houseType: ty,
    exclusiveArea: areaFromHouseType(ty),
    supplyArea: n(m.SUPLY_AR),
    generalUnits: n(m.SUPLY_HSHLDCO) ?? 0,
    specialUnits: n(m.SPSPLY_HSHLDCO) ?? 0,
    special: {
      multichild: n(m.MNYCH_HSHLDCO) ?? 0,
      newlywed: n(m.NWWDS_HSHLDCO) ?? 0,
      firstLife: n(m.LFE_FRST_HSHLDCO) ?? 0,
      oldParents: n(m.OLD_PARNTS_SUPORT_HSHLDCO) ?? 0,
      institution: n(m.INSTT_RECOMEND_HSHLDCO) ?? 0,
      transfer: n(m.TRANSR_INSTT_ENFSN_HSHLDCO) ?? 0,
      youth: n(m.YGMN_HSHLDCO) ?? 0,
      newborn: n(m.NWBB_HSHLDCO) ?? 0,
      etc: n(m.ETC_HSHLDCO) ?? 0,
    },
    priceManwon: n(m.LTTOT_TOP_AMOUNT), // 만원
  };
}

export function normalizeSimpleModel(m) {
  const ty = s(m.HOUSE_TY);
  return {
    modelNo: s(m.MODEL_NO),
    houseType: ty,
    exclusiveArea: areaFromHouseType(ty),
    supplyArea: n(m.SUPLY_AR),
    generalUnits: n(m.SUPLY_HSHLDCO) ?? 0,
    specialUnits: n(m.SPSPLY_HSHLDCO) ?? 0,
    special: {},
    priceManwon: n(m.LTTOT_TOP_AMOUNT),
  };
}

export function normalizeUrbtyModel(m) {
  const ty = s(m.TP) || s(m.GP);
  const ex = n(m.EXCLUSE_AR);
  return {
    modelNo: s(m.MODEL_NO),
    houseType: [s(m.GP), s(m.TP)].filter(Boolean).join(' ') || ty,
    exclusiveArea: ex ?? areaFromHouseType(ty),
    supplyArea: null,
    generalUnits: n(m.SUPLY_HSHLDCO) ?? 0,
    specialUnits: 0,
    special: {},
    priceManwon: n(m.SUPLY_AMOUNT),
    depositManwon: n(m.SUBSCRPT_REQST_AMOUNT),
  };
}

// ── 코너(공급 유형 묶음) ─────────────────────────────────────────────
// 화면 상단 탭이자, 각 공고가 어느 제도에 속하는지를 나타내는 분류.
export const CORNERS = [
  { key: 'apt',        label: '아파트 분양',        icon: '🏢', kinds: ['APT'],
    desc: '민영·국민주택 일반분양. 청약통장과 가점이 필요합니다.' },
  { key: 'remnant',    label: '무순위·잔여세대',    icon: '🎯', kinds: ['REMNDR'],
    desc: '미계약·부적격 물량 재공급. 가점 없이 추첨이라 통장이 약해도 노려볼 수 있습니다.' },
  { key: 'officetel',  label: '오피스텔·도시형',    icon: '🏬', kinds: ['URBTY'],
    desc: '오피스텔·도시형생활주택·생활형숙박시설. 청약통장 없이 추첨으로 뽑습니다.' },
  { key: 'publicrent', label: '공공지원 민간임대',  icon: '🤝', kinds: ['RENT'],
    desc: '시세보다 낮은 임대료로 8~10년 거주. 청년·신혼부부 우선공급이 있습니다.' },
  { key: 'lhsale',     label: '공공분양·신혼희망타운', icon: '🌱', kinds: ['LH_SALE', 'MYHOME_SALE'],
    desc: 'LH·SH·지방공사가 공급하는 공공분양과 신혼희망타운. 소득·자산 요건이 붙습니다.' },
  { key: 'lhrent',     label: '공공임대주택',       icon: '🏠', kinds: ['LH_RENT', 'MYHOME_RENT'],
    desc: '행복주택·국민임대·영구임대·통합공공임대·매입/전세임대. 소득·자산 기준으로 뽑고, 부모님이 60세 이상이어도 유주택으로 봅니다.' },
  { key: 'sh',         label: 'SH 서울주택도시공사', icon: '🏙️', kinds: ['SH'],
    desc: '장기전세·청년안심주택·행복주택·매입임대·미리내집 등. SH는 공고 API가 없어 공고 게시판을 직접 읽어옵니다 — 일정·조건은 공고 원문을 확인하세요.' },
  { key: 'hug',        label: 'HUG 든든전세',       icon: '🛡️', kinds: ['HUG'],
    desc: 'HUG가 전세보증금을 대신 갚고 매입한 주택을 공공임대로 공급합니다. 소득·자산 기준이 없고 무주택세대구성원이면 신청할 수 있습니다.' },
  { key: 'welfare',    label: '주거복지',           icon: '💚', kinds: ['LH_WELFARE'],
    desc: '주거취약계층·고령자 등 대상 주거지원 공고.' },
];

export const cornerOf = (kind) => CORNERS.find((c) => c.kinds.includes(kind))?.key || 'apt';

// ── LH 공고 정규화 ───────────────────────────────────────────────────
// LH 응답 필드명이 문서와 실제가 조금씩 다른 경우가 있어 후보 키를 순서대로 본다.
const pick = (o, ...keys) => { for (const k of keys) if (o[k] != null && String(o[k]).trim() !== '') return String(o[k]).trim(); return ''; };

const LH_KIND_BY_UPP = { '05': 'LH_SALE', '39': 'LH_SALE', '06': 'LH_RENT', '13': 'LH_WELFARE' };

export function normalizeLh(r) {
  const upp = pick(r, 'UPP_AIS_TP_CD');
  const kind = LH_KIND_BY_UPP[upp] || 'LH_RENT';
  const name = pick(r, 'PAN_NM', 'HSH_NM');
  const detail = pick(r, 'DTL_URL', 'PAN_DTL_URL');
  const status = pick(r, 'PAN_SS');
  const notice = toISO(pick(r, 'PAN_NT_ST_DT', 'PAN_DT'));
  const start = toISO(pick(r, 'RCPT_ST_DT', 'SBSCRT_RCPT_ST_DT', 'RCEPT_BGNDE')) || notice;
  const end = toISO(pick(r, 'RCPT_ED_DT', 'SBSCRT_RCPT_ED_DT', 'CLSG_DT'));
  const addr = pick(r, 'LGDN_DTL_ADR', 'HSH_ADR', 'CNP_CD_NM');

  return {
    kind,
    kindLabel: pick(r, 'AIS_TP_CD_NM') || pick(r, 'UPP_AIS_TP_NM') || 'LH 공고',
    source: 'LH',
    houseManageNo: pick(r, 'PAN_ID'),
    pblancNo: pick(r, 'PAN_ID'),
    id: `${kind}:${pick(r, 'PAN_ID')}`,
    panId: pick(r, 'PAN_ID'),
    uppCd: upp,
    aisTpCd: pick(r, 'AIS_TP_CD'),
    name,
    areaName: pick(r, 'CNP_CD_NM') || '서울',
    address: addr,
    gu: guFromAddress(addr) || guFromAddress(name),
    totalUnits: null,
    noticeDate: notice,
    receiptStart: start,
    receiptEnd: end,
    rank1Start: start,
    rank1End: end,
    resultDate: toISO(pick(r, 'PZWR_ANC_DT', 'PRZ_ANC_DT')),
    contractStart: null, contractEnd: null, moveIn: '',
    developer: 'LH 한국토지주택공사', builder: '', tel: pick(r, 'TEL_NO', 'CNTC_TEL_NO'),
    homepage: '', noticeUrl: detail,
    subType: pick(r, 'AIS_TP_CD_NM'),
    lhStatus: status,           // 공고중 / 접수중 / 접수마감 / 정정공고중
    attachments: [],
    models: [], cmpet: null, score: null,
    flags: {},
  };
}

/** LH 공급정보 → 주택형 모델. 필드명이 확정적이지 않아 후보를 넓게 본다. */
export function normalizeLhModel(m) {
  const ty = pick(m, 'HSH_NM', 'HTY_NM', 'LND_US_DS_CD_NM', 'BLK_NM') || '주택형';
  const ar = n(pick(m, 'AR', 'EXCLUSE_AR', 'SPL_AR', 'DDO_AR'));
  const units = n(pick(m, 'SPL_HSH_CNT', 'SPL_CNT', 'HSH_CNT', 'LNO'));
  const price = n(pick(m, 'SPL_XPC_AMT', 'SPL_AMT'));        // 원 단위로 오는 경우가 많다
  const deposit = n(pick(m, 'LS_GMY', 'RRTA_GMY', 'GMY'));   // 임대보증금
  const monthly = n(pick(m, 'MTH_RT_GMY', 'MT_RT_GMY'));     // 월임대료
  const toManwon = (v) => (v == null ? null : v >= 1000000 ? Math.round(v / 10000) : v);

  return {
    modelNo: pick(m, 'LNO', 'SPL_INF_TP_CD') || ty,
    houseType: ty,
    exclusiveArea: ar,
    supplyArea: null,
    generalUnits: units ?? 0,
    specialUnits: 0,
    special: {},
    priceManwon: toManwon(price),
    depositManwon: toManwon(deposit),
    monthlyManwon: toManwon(monthly),
  };
}

/** LH 상세 응답 어디에 있든 첨부파일(파일명 + URL) 쌍을 긁어낸다 */
export function extractAttachments(node, out = []) {
  if (Array.isArray(node)) { node.forEach((x) => extractAttachments(x, out)); return out; }
  if (!node || typeof node !== 'object') return out;

  const entries = Object.entries(node);
  const nameKey = entries.find(([k]) => /ATC?H.*(FILE|NM)|FILE.*(NM|NAME)|ATFL/i.test(k));
  const urlKey = entries.find(([k, v]) => typeof v === 'string' && /^https?:\/\//.test(v) && /FILE|ATCH|ATFL|URL/i.test(k));
  if (urlKey) {
    out.push({ name: (nameKey?.[1] && String(nameKey[1])) || decodeURIComponent(String(urlKey[1]).split('/').pop() || '첨부파일'), url: String(urlKey[1]) });
  }
  entries.forEach(([, v]) => extractAttachments(v, out));

  // 같은 URL 중복 제거
  const seen = new Set();
  return out.filter((a) => (seen.has(a.url) ? false : seen.add(a.url)));
}

// ── 마이홈포털 통합 공고 정규화 ──────────────────────────────────────
// 필드명이 문서와 실제가 다를 수 있어 후보 키를 넓게 본다.
const RENT_HINT = /임대|행복|국민|영구|매입|전세/;

export function normalizeMyhome(r, kindHint) {
  const name = pick(r, 'pblancNm', 'rcritNtcNm', 'houseNm', 'sujiNm', 'ntcNm', 'pblancTitle', 'title');
  const inst = pick(r, 'suplyInstNm', 'instNm', 'operInstNm', 'bsnsMbyNm', 'insttNm');
  const region = pick(r, 'brtcNm', 'ctprvnNm', 'sidoNm');
  const sgg = pick(r, 'signguNm', 'sggNm');
  const addr = pick(r, 'rnAdres', 'lcAdres', 'adres', 'hshldAdres') || [region, sgg].filter(Boolean).join(' ');
  const type = pick(r, 'houseTyNm', 'suplyTyNm', 'rnkNm', 'aisTpCdNm', 'pblancTyNm');
  const url = pick(r, 'dtlUrl', 'pblancUrl', 'ntcUrl', 'url', 'detailUrl');
  const id = pick(r, 'pblancId', 'rcritNtcId', 'panId', 'ntcId', 'pblancNo') || `${name}|${pick(r, 'pblancBeginDe', 'rcritPblancDe')}`;
  const kind = kindHint || (RENT_HINT.test(`${type}${name}`) ? 'MYHOME_RENT' : 'MYHOME_SALE');

  const notice = toISO(pick(r, 'pblancBeginDe', 'rcritPblancDe', 'pblancDe', 'ntcDe'));
  const start = toISO(pick(r, 'rceptBeginDe', 'sbscrptRceptBgnde', 'rcritBeginDe')) || notice;
  const end = toISO(pick(r, 'rceptEndDe', 'sbscrptRceptEndde', 'rcritEndDe', 'pblancEndDe'));

  return {
    kind,
    kindLabel: type || (kind === 'MYHOME_RENT' ? '공공임대' : '공공분양'),
    source: 'MYHOME',
    houseManageNo: id, pblancNo: id, id: `${kind}:${id}`,
    name: name || '(공고명 없음)',
    areaName: region || '서울',
    address: addr,
    gu: guFromAddress(addr) || guFromAddress(name),
    totalUnits: n(pick(r, 'suplyHshldco', 'totSuplyHshldco', 'hshldCo')),
    noticeDate: notice,
    receiptStart: start, receiptEnd: end,
    rank1Start: start, rank1End: end,
    resultDate: toISO(pick(r, 'przwnerPresnatnDe', 'przwnerDe')),
    contractStart: null, contractEnd: null, moveIn: pick(r, 'mvnPrearngeYm'),
    developer: inst || '공공주택사업자', builder: '',
    tel: pick(r, 'telno', 'cntcTelno', 'mdhsTelno'),
    homepage: '', noticeUrl: url,
    subType: type,
    attachments: [],
    models: [], cmpet: null, score: null,
    flags: {},
  };
}

/** 어느 필드든 '서울'이 들어 있으면 서울 공고로 본다 */
export const myhomeIsSeoul = (r) => /서울/.test(JSON.stringify(r));

// ── SH·HUG 게시판 수집분 정규화 ──────────────────────────────────────
export function normalizeSh(r) {
  return {
    kind: 'SH', kindLabel: r.type, source: 'SH',
    houseManageNo: r.seq, pblancNo: r.seq, id: `SH:${r.seq}`,
    name: r.title,
    areaName: '서울', address: '',
    gu: guFromAddress(r.title),
    totalUnits: null,
    noticeDate: toISO(r.date),
    // 게시판 목록에는 접수기간이 없다 — 지어내지 않고 '일정 미상'으로 둔다
    receiptStart: null, receiptEnd: null, rank1Start: null, rank1End: null,
    resultDate: null, contractStart: null, contractEnd: null, moveIn: '',
    developer: 'SH 서울주택도시공사', builder: '', tel: '1600-3456',
    homepage: 'https://www.i-sh.co.kr/', noticeUrl: r.url,
    subType: r.dept, scheduleUnknown: true,
    noticeKind: r.noticeKind,   // 모집 / 발표 / 안내
    attachments: [], models: [], cmpet: null, score: null, flags: {},
  };
}

export function normalizeHug(r) {
  const [from, to] = String(r.period || '').split(/\s*[~\-–]\s*/);
  const area = n(r.area);
  const deposit = n(r.deposit);
  const toManwon = (v) => (v == null ? null : v >= 1000000 ? Math.round(v / 10000) : v);
  const addr = [r.sido, r.sigungu, r.address].filter(Boolean).join(' ');

  return {
    kind: 'HUG', kindLabel: r.houseType || '든든전세주택', source: 'HUG',
    houseManageNo: r.no, pblancNo: r.no, id: `HUG:${r.no}`,
    name: `${r.sigungu || ''} ${r.address || ''}`.trim() || `든든전세주택 ${r.no}`,
    areaName: r.sido || '서울', address: addr,
    gu: guFromAddress(addr),
    totalUnits: 1,
    noticeDate: toISO(r.noticeDate),
    receiptStart: toISO(from), receiptEnd: toISO(to) || toISO(from),
    rank1Start: toISO(from), rank1End: toISO(to) || toISO(from),
    resultDate: null, contractStart: null, contractEnd: null, moveIn: '',
    developer: 'HUG 주택도시보증공사', builder: '', tel: '1566-9009',
    homepage: 'https://www.khug.or.kr/jeonse/web/s07/s070101.jsp',
    noticeUrl: r.url,
    subType: r.buyType, scheduleUnknown: !from,
    attachments: [],
    models: [{
      modelNo: r.no, houseType: r.houseType || '전용', exclusiveArea: area,
      supplyArea: null, generalUnits: 1, specialUnits: 0, special: {},
      priceManwon: null, depositManwon: toManwon(deposit), monthlyManwon: null,
    }],
    cmpet: null, score: null, flags: {},
  };
}
