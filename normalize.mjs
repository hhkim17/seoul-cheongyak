// 청약홈 원본 레코드 → 화면에서 쓰는 단일 스키마로 정규화

export const SEOUL_GU = [
  '강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구',
  '동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구',
  '용산구','은평구','종로구','중구','중랑구',
];

const s = (v) => (v == null ? '' : String(v).trim());
const n = (v) => {
  // '공고문 참조'처럼 숫자가 없는 값은 0이 아니라 '없음'이다
  const t = String(v ?? '').replace(/[^0-9.\-]/g, '');
  if (!/\d/.test(t)) return null;
  const x = Number(t);
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
    noticeKind: '모집',
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
    noticeKind: '모집',
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
    noticeKind: '모집',
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
    noticeKind: '모집',
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

/**
 * 공고 제목으로 성격을 가른다.
 *  모집 — 입주자를 뽑는 공고 (정정공고 포함)
 *  발표 — 당첨자·서류심사대상자 발표, 동호배정, 계약 안내 등 이미 끝난 건의 후속
 *  안내 — 그 밖의 공지
 * 청약홈 공고는 제목이 단지명뿐이라 분류하지 않고 '모집'으로 둔다.
 */
export function classifyNotice(title, fallback = '안내') {
  const t = String(title || '');
  if (/(당첨자|서류\s*심사|합격자|입주\s*대상자|대상자\s*발표|예비자\s*발표|명단\s*발표|동호\s*배정|사전\s*방문|계약\s*안내|입주\s*안내|결과\s*발표|추첨\s*결과)/.test(t)) return '발표';
  if (/(모집|공급\s*공고|청약\s*접수|입주자\s*선정)/.test(t)) return '모집';
  return fallback;
}

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
    // 상세·공급정보 조회에 그대로 넘겨야 하는 코드들
    splInfTpCd: pick(r, 'SPL_INF_TP_CD'),
    ccrCd: pick(r, 'CCR_CNNT_SYS_DS_CD'),
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
    noticeKind: classifyNotice(name, '모집'),
    lhStatus: status,           // 공고중 / 접수중 / 접수마감 / 정정공고중
    attachments: [],
    models: [], cmpet: null, score: null,
    flags: {},
  };
}

/** LH 공급정보(dsList01) → 주택형 모델. '공고문 참조' 같은 문자열은 금액 없음으로 둔다. */
export function normalizeLhModel(m) {
  const won = (v) => { const x = n(v); return x == null ? null : x >= 10000 ? Math.round(x / 10000) : x; };
  return {
    modelNo: pick(m, 'HTY_NNA') || pick(m, 'SBD_LGO_NM'),
    houseType: [pick(m, 'SBD_LGO_NM'), pick(m, 'HTY_NNA')].filter(Boolean).join(' · ') || '주택형',
    exclusiveArea: n(pick(m, 'DDO_AR')),
    supplyArea: n(pick(m, 'SPL_AR')),
    generalUnits: n(pick(m, 'NOW_HSH_CNT', 'HSH_CNT')) ?? 0,
    specialUnits: 0,
    special: {},
    priceManwon: null,
    depositManwon: won(pick(m, 'LS_GMY')),   // '공고문 참조'면 null
    monthlyManwon: won(pick(m, 'RFE')),
  };
}

/** LH 상세의 일정 행 → 공고 일정 */
export function lhScheduleOf(rows) {
  const first = (k) => { for (const r of rows) { const v = toISO(pick(r, k)); if (v) return v; } return null; };
  return {
    receiptStart: first('SBSC_ACP_ST_DT'),
    receiptEnd: first('SBSC_ACP_CLSG_DT'),
    docStart: first('PPR_ACP_ST_DT'),
    docEnd: first('PPR_ACP_CLSG_DT'),
    resultDate: first('PZWR_ANC_DT'),
    contractStart: first('CTRT_ST_DT'),
    contractEnd: first('CTRT_ED_DT'),
    acceptNote: rows.map((r) => pick(r, 'ACP_DTTM')).find(Boolean) || '',
  };
}

/** LH 상세의 첨부 행 → 파일 목록 */
export function lhFilesOf(rows) {
  const seen = new Set();
  return rows.map((r) => ({
    name: pick(r, 'CMN_AHFL_NM') || pick(r, 'LS_SPL_INF_UPL_FL_DS_CD_NM') || '첨부파일',
    kind: pick(r, 'LS_SPL_INF_UPL_FL_DS_CD_NM'),
    url: pick(r, 'AHFL_URL'),
  })).filter((f) => f.url && (seen.has(f.url) ? false : seen.add(f.url)));
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
// 필드명은 실제 응답에서 확인한 것을 쓴다.
export function normalizeMyhome(r, kindHint) {
  const id = `${pick(r, 'pblancId')}_${pick(r, 'houseSn') || '0'}`;
  const inst = pick(r, 'suplyInsttNm');                    // LH / SH / 지방공사
  const addr = pick(r, 'fullAdres') || [pick(r, 'brtcNm'), pick(r, 'signguNm')].filter(Boolean).join(' ');
  const supplyTy = pick(r, 'suplyTyNm');                   // 매입임대 / 행복주택 / 국민임대 …
  const houseTy = pick(r, 'houseTyNm');                    // 아파트 / 다가구주택 …
  const kind = kindHint || (supplyTy ? 'MYHOME_RENT' : 'MYHOME_SALE');
  const money = (v) => { const x = n(v); return x ? Math.round(x / 10000) : null; };  // 원 → 만원
  const units = n(pick(r, 'sumSuplyCo', 'totHshldCo'));
  const name = pick(r, 'pblancNm');

  const model = {
    modelNo: id,
    houseType: houseTy || supplyTy || '전체',
    exclusiveArea: null, supplyArea: null,
    generalUnits: units ?? 0, specialUnits: 0, special: {},
    priceManwon: kind === 'MYHOME_SALE' ? money(pick(r, 'surlus')) : null,
    depositManwon: money(pick(r, 'rentGtn')),
    monthlyManwon: money(pick(r, 'mtRntchrg')),
  };

  return {
    kind,
    kindLabel: supplyTy || houseTy || (kind === 'MYHOME_RENT' ? '공공임대' : '공공분양'),
    source: 'MYHOME',
    houseManageNo: pick(r, 'pblancId'), pblancNo: pick(r, 'pblancId'), id: `${kind}:${id}`,
    name: name || pick(r, 'hsmpNm') || '(공고명 없음)',
    areaName: pick(r, 'brtcNm') || '서울',
    address: addr,
    gu: guFromAddress(addr) || guFromAddress(name),
    totalUnits: units,
    noticeDate: toISO(pick(r, 'rcritPblancDe')),
    receiptStart: toISO(pick(r, 'beginDe')),
    receiptEnd: toISO(pick(r, 'endDe')),
    rank1Start: toISO(pick(r, 'beginDe')),
    rank1End: toISO(pick(r, 'endDe')),
    resultDate: toISO(pick(r, 'przwnerPresnatnDe')),
    contractStart: null, contractEnd: null, moveIn: '',
    developer: inst || '공공주택사업자',
    builder: '', tel: pick(r, 'refrnc'),
    homepage: pick(r, 'pcUrl'),
    noticeUrl: pick(r, 'url') || pick(r, 'pcUrl'),
    subType: [inst, pick(r, 'sttusNm')].filter(Boolean).join(' · '),
    noticeKind: classifyNotice(name, '모집'),
    heating: pick(r, 'heatMthdNm'),
    attachments: [],
    models: (model.generalUnits || model.depositManwon || model.priceManwon) ? [model] : [],
    cmpet: null, score: null, flags: {},
  };
}

/** 시도명 또는 주소로 서울 여부를 가린다 */
export const myhomeIsSeoul = (r) =>
  /서울/.test(String(r.brtcNm || '')) || String(r.fullAdres || '').startsWith('서울');

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
    // 상세 본문에서 접수기간을 찾았으면 쓰고, 못 찾았으면 지어내지 않고 비워 둔다
    receiptStart: r.receiptStart || null, receiptEnd: r.receiptEnd || null,
    rank1Start: r.receiptStart || null, rank1End: r.receiptEnd || null,
    resultDate: null, contractStart: null, contractEnd: null, moveIn: '',
    developer: 'SH 서울주택도시공사', builder: '', tel: '1600-3456',
    homepage: 'https://www.i-sh.co.kr/', noticeUrl: r.url,
    subType: r.dept, scheduleUnknown: !r.receiptStart,
    noticeKind: r.noticeKind || classifyNotice(r.title),   // 모집 / 발표 / 안내
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
