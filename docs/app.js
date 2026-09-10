// 서울 청약 대시보드 — 프론트엔드
import * as Sync from './sync.js?v=9d648ba3';
import * as Std from './standards.js?v=9d648ba3';
import * as Rank from './rank.js?v=9d648ba3';

const $ = (s) => document.querySelector(s);
// 화면 조각이 하나라도 빠져 있으면(브라우저에 남은 옛 HTML 등) 예외가 나서
// 그 뒤 코드가 통째로 멈춘다. 그래서 값 읽고 쓰는 건 전부 널 안전하게 둔다.
const setVal = (s, v) => { const e = $(s); if (e) e.value = v; };
const setChk = (s, v) => { const e = $(s); if (e) e.checked = !!v; };
const valOf = (s) => $(s)?.value ?? '';
const chkOf = (s) => !!$(s)?.checked;
const on = (s, ev, fn) => { const e = $(s); if (e) e.addEventListener(ev, fn); };
const el = (t, cls, html) => { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** toISOString()은 UTC로 바꿔 날짜가 하루 밀린다 — 화면에는 로컬 날짜를 쓴다 */
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = localISO(new Date());
const dayDiff = (iso) => iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(TODAY + 'T00:00:00')) / 86400000) : null;
const fmtDate = (iso) => iso ? iso.replace(/-/g, '.').slice(2) : '—';
const num = (v) => (v == null || Number.isNaN(v)) ? '—' : v.toLocaleString('ko-KR');

/** 만원 → "8.4억" */
function eok(manwon) {
  if (manwon == null) return '—';
  const v = manwon / 10000;
  return v >= 10 ? `${v.toFixed(1)}억` : `${v.toFixed(2)}억`;
}
/** 평단가(만원/평) */
function pyeongPrice(m) {
  const area = m.supplyArea || m.exclusiveArea;
  if (!m.priceManwon || !area) return null;
  return Math.round(m.priceManwon / (area / 3.305785));
}

const SEOUL_GU = ['강남구','강동구','강북구','강서구','관악구','광진구','구로구','금천구','노원구','도봉구','동대문구','동작구','마포구','서대문구','서초구','성동구','성북구','송파구','양천구','영등포구','용산구','은평구','종로구','중구','중랑구'];

const SPECIAL_TYPES = [
  { key: 'newlywed',   label: '신혼부부',   field: 'newlywed' },
  // 제도상 '혼인을 계획 중이며 입주 전까지 혼인사실을 증명할 수 있는 자'.
  // 날짜가 아니라 의사를 묻는 요건이라 날짜를 받지 않는다.
  { key: 'preNewlywed', label: '예비신혼부부', field: 'newlywed' },
  { key: 'firstLife',  label: '생애최초',   field: 'firstLife' },
  { key: 'multichild', label: '다자녀',     field: 'multichild' },
  { key: 'oldParents', label: '노부모부양', field: 'oldParents' },
  { key: 'youth',      label: '청년',       field: 'youth' },
  { key: 'newborn',    label: '신생아',     field: 'newborn' },
  { key: 'institution',label: '기관추천',   field: 'institution' },
];

// GitHub Pages 등 정적 호스팅에서는 서버 API가 없으므로 빌드된 스냅샷을 읽는다.
const STATIC = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

// 코너 = 제도별 묶음. 빌드 스냅샷이 주면 그걸 쓰고, 없으면 이 기본값을 쓴다.
const DEFAULT_CORNERS = [
  { key: 'apt', label: '아파트 분양', icon: '🏢', kinds: ['APT'], desc: '민영·국민주택 일반분양. 청약통장과 가점이 필요합니다.' },
  { key: 'remnant', label: '무순위·잔여세대', icon: '🎯', kinds: ['REMNDR'], desc: '미계약·부적격 물량 재공급. 가점 없이 추첨이라 통장이 약해도 노려볼 수 있습니다.' },
  { key: 'officetel', label: '오피스텔·도시형', icon: '🏬', kinds: ['URBTY'], desc: '오피스텔·도시형생활주택·생활형숙박시설. 청약통장 없이 추첨으로 뽑습니다.' },
  { key: 'lhsale', label: '공공분양·신혼희망타운', icon: '🌱', kinds: ['LH_SALE', 'MYHOME_SALE'], desc: 'LH·SH·지방공사가 공급하는 공공분양과 신혼희망타운. 소득·자산 요건이 붙습니다.' },
  { key: 'happy', label: '행복주택', icon: '🌤️', kinds: [], desc: '청년·신혼부부·대학생 대상 임대주택. 시세보다 싸고 최장 6~10년 살 수 있습니다.' },
  { key: 'longterm', label: '장기전세', icon: '🏘️', kinds: [], desc: '보증금만 내고 최장 20년까지 사는 SH 장기전세주택(시프트).' },
  { key: 'youth', label: '청년안심주택', icon: '🧑‍🎓', kinds: [], desc: '역세권 청년주택. 청년·신혼부부가 시세보다 싸게 삽니다.' },
  { key: 'purchase', label: '매입임대', icon: '🏡', kinds: [], desc: '기존 주택을 공사가 사들여 다시 빌려주는 방식. 미리내집·도전숙도 여기 들어갑니다.' },
  { key: 'jeonsae', label: '전세임대', icon: '🔑', kinds: [], desc: '내가 살 집을 고르면 공사가 집주인과 전세계약을 맺고 다시 빌려줍니다.' },
  { key: 'social', label: '사회주택', icon: '🏚️', kinds: [], desc: '사회적경제 주체가 운영하는 임대주택. 두레주택·희망하우징 포함.' },
  { key: 'publichome', label: '공공임대', icon: '🏠', kinds: ['LH_RENT', 'MYHOME_RENT'], desc: '국민임대·영구임대·통합공공임대·재개발임대. 소득·자산 기준으로 뽑습니다.' },
  { key: 'publicrent', label: '공공지원 민간임대', icon: '🤝', kinds: ['RENT'], desc: '시세보다 낮은 임대료로 8~10년 거주. 청년·신혼부부 우선공급이 있습니다.' },
  { key: 'hug', label: 'HUG 든든전세', icon: '🛡️', kinds: ['HUG'], desc: 'HUG가 전세보증금을 대신 갚고 매입한 주택. 소득·자산 기준이 없습니다.' },
  { key: 'welfare', label: '주거복지', icon: '💚', kinds: ['LH_WELFARE'], desc: '주거취약계층·고령자 등 대상 주거지원 공고.' },
  { key: 'etc', label: '기타', icon: '🗂️', kinds: [], desc: '위 유형으로 나누기 어려운 공고입니다.' },
];
let CORNERS = DEFAULT_CORNERS;
let STD = null;   // { urban: {year, base}, median: {year, base} }

/** 가구원수 = 부양가족 + 본인 */
/**
 * 소득 기준에 쓰는 가구원수는 등본상 세대원 수다.
 * 청약 가점의 '부양가족 수'와 다르다 — 부모님과 사는 미혼 청년은
 * 부양가족 0명이지만 세대원은 3명이다. 따로 받되, 없으면 갈음한다.
 */
/** n년 뒤 시점의 값으로 바꿔 본다 (납입은 매월 이어간다고 가정) */
const shift = (v, perYear) => (v == null ? v : v + perYear * futureYears);
const futureAge = () => { const a = myAgeYears(); return a == null ? null : a + futureYears; };

const householdSize = () => Math.max(1, Number(profile.householdCount) || (Number(profile.family) || 0) + 1);
const myAgeYears = () => (profile.birthYm ? Math.floor(yearsBetween(`${profile.birthYm}-01`) ?? 0) : null);

// 임대 공고는 분양가가 아니라 보증금·월세로 읽어야 한다
const RENTAL_KINDS = ['RENT', 'LH_RENT', 'LH_WELFARE', 'MYHOME_RENT', 'SH', 'HUG'];
const isRental = (l) => RENTAL_KINDS.includes(l.kind);

// 코너 판정은 서버가 붙여 주는 corner를 그대로 쓰고, 없을 때만 kind로 되짚는다
const cornerOf = (l) => l.corner || CORNERS.find((c) => c.kinds.includes(l.kind))?.key || 'etc';
const agencyOf = (l) => l.agency || '민간·기타';

/** 이 공고에 대해 내 소득·자산이 어디쯤인지 — 유형별 규칙은 standards.js가 가진다 */
function incomeCheck(l) {
  if (!STD) return { verdict: 'unknown' };
  const has = profile.incomeManwon != null || profile.soloIncomeManwon != null;
  if (!has) return { verdict: 'unknown' };
  return Std.evaluate(l, {
    householdIncome: profile.incomeManwon != null ? profile.incomeManwon * 10000 : null,
    soloIncome: profile.soloIncomeManwon != null ? profile.soloIncomeManwon * 10000 : null,
    householdAsset: profile.assetManwon,
    soloAsset: profile.soloAssetManwon,
    realEstate: profile.realEstateManwon,
    car: profile.carManwon,
    dualIncome: profile.dualIncome,
    household: householdSize(),
    newbornCount: Number(profile.newbornCount) || 0,
    tier: Std.guessTier({ ageYears: futureAge(), special: profile.special }),
  }, STD);
}

const STATUSES = [
  { key: 'live', label: '접수중' },
  { key: 'soon', label: '접수예정' },
  { key: 'result', label: '발표대기' },
  { key: 'notice', label: '일정 미상' },
  { key: 'done', label: '종료' },
];

// ── 날짜에서 기간 뽑기 ───────────────────────────────────────────────
const yearsBetween = (from, to = new Date()) => {
  if (!from) return null;
  const a = new Date(from);
  if (Number.isNaN(+a)) return null;
  const months = (to.getFullYear() - a.getFullYear()) * 12 + (to.getMonth() - a.getMonth()) - (to.getDate() < a.getDate() ? 1 : 0);
  return Math.max(0, months / 12);
};

/**
 * 무주택 기간 기산일 — 주택공급규칙 기준.
 *  · 기본은 신청자가 만 30세가 되는 날
 *  · 30세 전에 혼인했다면 혼인신고일
 *  · 본인·배우자가 집을 소유한 적이 있으면 무주택이 된 날부터 다시
 * 만 60세 이상 직계존속의 주택은 없는 것으로 보므로 여기에 영향을 주지 않는다
 * (단 노부모부양 특별공급과 공공임대는 예외 — 화면 도움말에 적어 뒀다).
 */
export function noHouseStart(p) {
  if (!p.birthYm) return null;
  const b = new Date(`${p.birthYm}-01`);
  if (Number.isNaN(+b)) return null;
  let start = new Date(b.getFullYear() + 30, b.getMonth(), 1);
  if (p.marriageDate) {
    const m = new Date(p.marriageDate);
    if (!Number.isNaN(+m) && m < start) start = m;
  }
  if (p.noHouseSince) {
    const h = new Date(p.noHouseSince);
    if (!Number.isNaN(+h) && h > start) start = h;
  }
  return start;
}

/** 아직 만 30세가 안 됐으면 무주택 기간은 0 */
export function noHouseYearsOf(p) {
  const start = noHouseStart(p);
  if (!start) return p.noHouseYears ?? 0;          // 예전 형식(년수 직접 입력) 호환
  if (start > new Date()) return 0;
  return yearsBetween(start) ?? 0;
}

export function accountYearsOf(p) {
  if (!p.accountYm) return p.accountYears ?? 0;    // 예전 형식 호환
  return yearsBetween(`${p.accountYm}-01`) ?? 0;
}

// ── 청약 가점 계산 (주택공급규칙 별표1) ───────────────────────────────
function noHouseScore(y) { if (!y || y < 1) return 2; return Math.min(32, 2 + Math.floor(y) * 2); }
function accountScore(y) {
  if (!y || y < 0.5) return 1;
  if (y < 1) return 2;
  return Math.min(17, 3 + (Math.floor(y) - 1));
}
function familyScore(n) { return Math.min(35, 5 + (Number(n) || 0) * 5); }
function totalScore(p) {
  return noHouseScore(shift(noHouseYearsOf(p), 1)) + accountScore(shift(accountYearsOf(p), 1)) + familyScore(p.family);
}

// ── 상태 판정 ────────────────────────────────────────────────────────
function windows(l) {
  const w = [];
  if (l.specialStart) w.push({ label: '특별공급 접수', from: l.specialStart, to: l.specialEnd || l.specialStart });
  if (l.rank1Start) w.push({ label: l.kind === 'APT' ? '1순위 (해당지역)' : '접수', from: l.rank1Start, to: l.rank1End || l.rank1Start });
  if (l.kind === 'APT' && l.rank1EtcStart) w.push({ label: '1순위 (기타지역)', from: l.rank1EtcStart, to: l.rank1EtcEnd || l.rank1EtcStart });
  if (l.kind === 'APT' && l.rank2Start) w.push({ label: '2순위', from: l.rank2Start, to: l.rank2End || l.rank2Start });
  if (!w.length && l.receiptStart) w.push({ label: '청약 접수', from: l.receiptStart, to: l.receiptEnd || l.receiptStart });
  return w.filter((x) => x.from).sort((a, b) => a.from.localeCompare(b.from));
}

function statusOf(l) {
  const w = windows(l);
  const open = w.find((x) => x.from <= TODAY && TODAY <= x.to);
  if (open) return { key: 'live', label: `${open.label} 접수중`, until: open.to, d: dayDiff(open.to) };
  const next = w.find((x) => x.from > TODAY);
  if (next) return { key: 'soon', label: `${next.label} 예정`, until: next.from, d: dayDiff(next.from) };
  if (l.resultDate && l.resultDate >= TODAY) return { key: 'result', label: '당첨자 발표 대기', until: l.resultDate, d: dayDiff(l.resultDate) };
  // 게시판에서 긁어온 공고는 접수 일정이 목록에 없다. 마감으로 단정하지 않는다.
  if (!w.length && l.scheduleUnknown) return { key: 'notice', label: '접수 일정은 공고문 확인', until: l.noticeDate, d: null };
  return { key: 'done', label: '접수 마감', until: w.at(-1)?.to || l.receiptEnd, d: null };
}

// ── 프로필 ───────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  birthYm: '', marriageDate: '', noHouseSince: '', accountYm: '', family: 0, householdCount: null, newbornCount: 0,
  payments: null, depositManwon: null,
  incomeManwon: null, soloIncomeManwon: null, assetManwon: null, soloAssetManwon: null,
  realEstateManwon: null, carManwon: null, dualIncome: false,
  budgetEok: 9, areaMin: 49, areaMax: 99,
  special: [], gu: [], seoulResident: true,
  incomeKind: 'work',   // work=근로 · biz=사업(프리랜서) · both
};
let profile = { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem('cheongyak.profile') || '{}') };
const saveProfile = () => localStorage.setItem('cheongyak.profile', JSON.stringify(profile));

// 스크랩(관심 공고) — 브라우저에 저장한다
let scraps = new Set(JSON.parse(localStorage.getItem('cheongyak.scraps') || '[]'));
const saveScraps = () => localStorage.setItem('cheongyak.scraps', JSON.stringify([...scraps]));
function toggleScrap(id) {
  scraps.has(id) ? scraps.delete(id) : scraps.add(id);
  saveScraps(); schedulePush(); renderAll();
}

// 메일 알림 조건 — 로컬 서버가 watch.json에 써 주고, 없으면 화면에서 복사
const DEFAULT_WATCH = {
  '코너': ['apt', 'remnant', 'publicrent', 'lhrent', 'lhsale', 'sh', 'hug'],
  '관심자치구': [], '최대분양가_억': 12, '최대보증금_억': 5,
  '전용면적_최소': 0, '전용면적_최대': 200,
  '해당특별공급': [], '가격정보없어도_알림': true, '모집공고만': true,
};
let watchCfg = { ...DEFAULT_WATCH, ...JSON.parse(localStorage.getItem('cheongyak.watch') || '{}') };

// 통장·무주택 기간이 쌓이면 순위와 가점이 달라진다. 결혼 시점과 무관하게 미리 본다.
let futureYears = 0;

let filters = { status: ['live', 'soon', 'result', 'notice'], corner: 'all', gu: [], agency: [], q: '', sort: 'match', budgetOnly: false, eligibleOnly: false, showAnnouncements: false, incomeFitOnly: false, eligibleOnly2: false };
let listings = [];
let meta = {};

// ── 맞춤 점수 ────────────────────────────────────────────────────────
function analyze(l) {
  const budgetManwon = profile.budgetEok * 10000;
  const myScore = totalScore(profile);
  const models = l.models || [];
  const rental = isRental(l);
  // 임대는 분양가가 없다 — 보증금을 예산과 견준다
  const priceOf = (m) => (rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
  const priced = models.filter((m) => priceOf(m));
  const affordable = priced.filter((m) => priceOf(m) <= budgetManwon);
  const inArea = models.filter((m) => m.exclusiveArea != null && m.exclusiveArea >= profile.areaMin && m.exclusiveArea <= profile.areaMax);

  const eligibleSpecial = SPECIAL_TYPES.filter((t) =>
    profile.special.includes(t.key) && models.some((m) => (m.special?.[t.field] || 0) > 0));

  const st = statusOf(l);
  const income = incomeCheck(l);

  // 순위는 신청 면적에 따라 갈린다 — 선호 범위 안의 주택형, 없으면 가장 작은 것으로 본다
  const allAreas = (l.models || []).map((m) => m.exclusiveArea).filter((a) => a != null);
  const prefAreas = allAreas.filter((a) => a >= profile.areaMin && a <= profile.areaMax);
  const rankArea = prefAreas.length ? Math.min(...prefAreas) : (allAreas.length ? Math.min(...allAreas) : null);
  const rank = Rank.judgeRank(l, {
    accountYears: shift(accountYearsOf(profile), 1),
    payments: shift(profile.payments, 12),
    depositManwon: profile.depositManwon,
  }, rankArea);
  const reasons = [];
  let score = 0;

  // 예산 (20) — 자격이 1차 관문이므로 비중을 낮춘다
  if (!priced.length) { score += 7; reasons.push({ t: rental ? '임대조건 공고문 확인' : '분양가 미공개' }); }
  else if (!affordable.length) { reasons.push({ t: `예산 초과 (최저 ${eok(Math.min(...priced.map(priceOf)))})`, neg: true }); }
  else {
    const ratio = affordable.length / priced.length;
    score += 10 + Math.round(10 * ratio);
    reasons.push({ t: `${rental ? '보증금' : '예산'} 내 ${affordable.length}/${priced.length}개 타입` });
  }

  // 면적 (15)
  if (inArea.length) { score += 10 + Math.round(5 * (inArea.length / Math.max(models.length, 1))); reasons.push({ t: `선호 면적 ${inArea.length}개 타입` }); }
  else if (models.length) reasons.push({ t: '선호 면적대 없음', neg: true });

  // 지역 (15)
  if (!profile.gu.length) score += 9;
  else if (l.gu && profile.gu.includes(l.gu)) { score += 15; reasons.push({ t: `관심 자치구 · ${l.gu}` }); }

  // 자격 / 당첨 가능성 (40) — 신청할 수 있는지가 가장 중요하다
  if (eligibleSpecial.length) {
    score += 40;
    reasons.push({ t: `특별공급 해당 · ${eligibleSpecial.map((t) => t.label).join('·')}` });
  } else if (rental) {
    // 임대는 가점이 아니라 소득·자산 기준으로 뽑는다
    if (income.verdict === 'ok') { score += 40; reasons.push({ t: `소득 ${income.myPercent}% — ${income.rule} 기준 ${income.thresholdPercent}% 이내` }); }
    else if (income.verdict === 'tight') { score += 24; reasons.push({ t: `소득 ${income.myPercent}% — 기준 ${income.thresholdPercent}%에 근접` }); }
    else if (income.verdict === 'over') { reasons.push({ t: income.assetOver ? `${income.assetOver} 한도 초과` : `소득 ${income.myPercent}% — 기준 ${income.thresholdPercent}% 초과`, neg: true }); }
    else { score += 28; reasons.push({ t: '소득·자산 요건 — 공고문 확인 필요' }); }
  } else if (l.kind === 'LH_SALE') {
    score += 26;
    reasons.push({ t: 'LH 공공분양 — 소득·자산 요건 있음' });
  } else if (l.kind === 'REMNDR') {
    score += 32;
    reasons.push({ t: '무순위 — 가점 무관 추첨' });
  } else if (l.kind === 'URBTY') {
    score += 29;
    reasons.push({ t: '청약통장 가점 무관 (추첨)' });
  } else {
    const cut = cutlineFor(l);
    if (cut != null) {
      const margin = myScore - cut;
      score += Math.max(0, Math.min(40, 19 + margin * 2.4));
      reasons.push({ t: `내 가점 ${myScore} vs ${profile.seoulResident ? '해당지역' : '기타지역'} 커트라인 ${cut}`, neg: margin < 0 });
    } else {
      score += 16;
      reasons.push({ t: `내 가점 ${myScore}점` });
    }
  }

  // 타이밍 (10)
  if (st.key === 'live') { score += 10; }
  else if (st.key === 'soon') { score += st.d <= 7 ? 9 : st.d <= 30 ? 7 : 4; }
  else if (st.key === 'result') { score += 2; }
  else if (st.key === 'notice') { score += 6; }

  const prices = priced.map(priceOf);
  const areas = models.map((m) => m.exclusiveArea).filter((a) => a != null);
  const pp = rental ? [] : priced.map(pyeongPrice).filter(Boolean);
  const monthlies = models.map((m) => m.monthlyManwon).filter((v) => v != null);

  // 자격이 분명히 안 되면 아무리 조건이 좋아도 위로 올리지 않는다
  const capped = (income.verdict === 'over' || rank?.rank === 3) ? Math.min(score, 35) : score;

  return {
    status: st,
    score: Math.max(0, Math.min(100, Math.round(capped))),
    reasons,
    affordable: affordable.length,
    pricedCount: priced.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minArea: areas.length ? Math.min(...areas) : null,
    maxArea: areas.length ? Math.max(...areas) : null,
    pyeong: pp.length ? Math.round(pp.reduce((a, b) => a + b, 0) / pp.length) : null,
    rental,
    income,
    rank,
    minMonthly: monthlies.length ? Math.min(...monthlies) : null,
    maxMonthly: monthlies.length ? Math.max(...monthlies) : null,
    eligibleSpecial,
    myScore,
    cmpetAvg: cmpetAverage(l),
  };
}

/** 해당지역 1순위 평균 경쟁률 */
function cmpetAverage(l) {
  const rows = (l.cmpet || []).filter((r) => {
    const rate = parseFloat(String(r.CMPET_RATE || '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(rate)) return false;
    if (l.kind === 'APT') return r.RESIDE_SECD === '01' && String(r.SUBSCRPT_RANK_CODE ?? '1') === '1';
    return true;
  }).map((r) => parseFloat(String(r.CMPET_RATE).replace(/[^0-9.]/g, '')));
  if (!rows.length) return null;
  return Math.round((rows.reduce((a, b) => a + b, 0) / rows.length) * 10) / 10;
}

/** 같은 자치구의 최근 당첨 커트라인(최저가점) 중앙값 — 없으면 서울 전체 */
let cutlineCache = null;
function buildCutlines() {
  const byGu = {}; const all = [];
  for (const l of listings) {
    for (const r of l.score || []) {
      const v = parseFloat(r.LWET_SCORE);
      if (!Number.isFinite(v) || v <= 0) continue;
      // 서울 거주자는 해당지역(01), 그 외는 기타지역(02·03) 커트라인과 견준다
      const want = profile.seoulResident ? '01' : '02';
      if (r.RESIDE_SECD && r.RESIDE_SECD !== want) continue;
      all.push(v);
      if (l.gu) (byGu[l.gu] ||= []).push(v);
    }
  }
  const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)]); };
  cutlineCache = { byGu: Object.fromEntries(Object.entries(byGu).map(([k, v]) => [k, med(v)])), all: med(all) };
}
function cutlineFor(l) {
  if (!cutlineCache) buildCutlines();
  if (l.gu && cutlineCache.byGu[l.gu] != null) return cutlineCache.byGu[l.gu];
  return cutlineCache.all;
}

// ── 렌더링 ───────────────────────────────────────────────────────────
function renderMeCard() {
  const s = totalScore(profile);
  const nh = noHouseYearsOf(profile), ac = accountYearsOf(profile);
  const yr = (v) => `${Math.floor(v)}년${Math.round((v % 1) * 12) ? ` ${Math.round((v % 1) * 12)}개월` : ''}`;
  $('#meCard').innerHTML = `
    <div class="big">${s}<span style="font-size:13px;color:var(--text-3)"> / 84점</span></div>
    <div class="sub">내 청약 가점${profile.birthYm ? '' : ' · 조건 미입력'}</div>
    <div class="row"><span>무주택 ${yr(nh)}</span><b>${noHouseScore(nh)}점</b></div>
    <div class="row"><span>통장 ${yr(ac)}</span><b>${accountScore(ac)}점</b></div>
    <div class="row"><span>부양가족 ${profile.family}명</span><b>${familyScore(profile.family)}점</b></div>
    <div class="row" style="margin-top:8px;border-top:1px solid var(--line-soft);padding-top:8px">
      <span>예산</span><b>${profile.budgetEok}억</b></div>
    <div class="row"><span>선호 전용</span><b>${profile.areaMin}~${profile.areaMax}㎡</b></div>`;
}

// 소득을 어디서 떼어 오는지가 근로소득과 사업소득이 서로 다르다.
// 공고문 [별표3]이 근거이고, 화면에도 그 근거를 같이 적어 둔다.
const INCOME_SRC = {
  work: {
    where: '<a href="https://www.nhis.or.kr" target="_blank" rel="noopener">국민건강보험</a> 「보험료 조회 › <b>직장보험료 조회</b>」',
    what: '<b>보수월액</b> — 세전 월급',
    when: '<b>공고일 시점</b> · 지금 받는 월급 기준',
    why: '공고문 [별표3] — 상시근로자 소득은 여러 기관 자료 중 <b>①국민건강보험공단</b> 자료를 1순위로 반영합니다.',
  },
  biz: {
    where: '<a href="https://www.hometax.go.kr" target="_blank" rel="noopener">홈택스</a> 「민원증명 › <b>소득금액증명</b>」',
    what: '<b>사업소득금액 ÷ 12</b> — 통장에 들어온 돈이 아니라 <b>필요경비를 뺀 뒤</b>의 금액',
    when: '<b>전년도 종합소득세 신고분</b> · 연 1회(5월)만 갱신돼 시차가 있습니다',
    why: '공고문 [별표3] — 프리랜서는 <b>기타사업소득</b>이고, 공적자료는 <b>국세청 종합소득(사업소득)</b>입니다. 건강보험 보수월액은 쓰이지 않습니다.',
  },
  both: {
    where: '건강보험 <b>보수월액</b> + 홈택스 <b>소득금액증명</b>',
    what: '보수월액 <b>＋</b> 사업소득금액 ÷ 12 — 두 값을 <b>더해서</b> 넣습니다',
    when: '근로분은 현재 월급, 사업분은 전년도 신고분',
    why: '공고문 [별표3]은 근로소득·사업소득·재산소득·기타소득 <b>12가지를 합산</b>해 월평균소득을 산정합니다.',
  },
};

function renderIncomeSrc() {
  const box = $('#incomeSrc');
  const row = $('#pIncomeKind');
  if (!box || !row) return;
  const kind = INCOME_SRC[profile.incomeKind] ? profile.incomeKind : 'work';
  for (const b of row.querySelectorAll('.chip')) b.classList.toggle('on', b.dataset.kind === kind);
  const g = INCOME_SRC[kind];
  box.innerHTML = `<dl>
    <dt>어디서</dt><dd>${g.where}</dd>
    <dt>넣을 값</dt><dd>${g.what}</dd>
    <dt>기간</dt><dd>${g.when}</dd>
  </dl><p class="why">${g.why}</p>`;
}

function chipRow(container, options, selected, onToggle) {
  container.innerHTML = '';
  for (const o of options) {
    const c = el('button', 'chip' + (selected.includes(o.key) ? ' on' : ''), esc(o.label));
    c.onclick = () => onToggle(o.key);
    container.appendChild(c);
  }
}

const FUTURE_OPTIONS = [
  { key: '0', label: '지금' }, { key: '1', label: '+1년' }, { key: '2', label: '+2년' }, { key: '3', label: '+3년' },
];

function renderFuture() {
  chipRow($('#fFuture'), FUTURE_OPTIONS, [String(futureYears)], (k) => {
    futureYears = Number(k);
    cutlineCache = null;
    renderAll();
  });

  const note = $('#futureNote');
  if (!futureYears) { note.textContent = ''; return; }
  const age = futureAge();
  const lines = [`통장 ${Math.floor(shift(accountYearsOf(profile), 1))}년`];
  if (profile.payments != null) lines.push(`납입 ${shift(profile.payments, 12)}회`);
  lines.push(`무주택 ${Math.floor(shift(noHouseYearsOf(profile), 1))}년`);
  note.innerHTML = `${futureYears}년 뒤 기준 · ${lines.join(' · ')} <span class="hint">(매월 납입 가정)</span>`
    + (age != null && age > 39
      ? `<br><b style="color:var(--hot)">만 ${age}세 — 청년 유형 신청 자격이 사라집니다.</b>`
      : (age != null && age >= 37 ? `<br><b style="color:var(--warn)">만 ${age}세 — 청년 자격(만 39세)이 얼마 안 남았습니다.</b>` : ''));
}

function renderFilters() {
  renderFuture();
  chipRow($('#fStatus'), STATUSES, filters.status, (k) => { toggle(filters.status, k); renderAll(); });
  const agencies = [...new Set(listings.map(agencyOf))].sort().map((a) => ({ key: a, label: a }));
  chipRow($('#fAgency'), agencies, filters.agency, (k) => { toggle(filters.agency, k); renderAll(); });
  const gus = SEOUL_GU.filter((g) => listings.some((l) => l.gu === g)).map((g) => ({ key: g, label: g }));
  chipRow($('#fGu'), gus, filters.gu, (k) => { toggle(filters.gu, k); renderAll(); });
  $('#fSort').value = filters.sort;
  $('#fBudget').checked = filters.budgetOnly;
  $('#fEligible').checked = filters.eligibleOnly;
  $('#fAnnounce').checked = filters.showAnnouncements;
  $('#fIncomeFit').checked = filters.incomeFitOnly;
  $('#fEligibleOnly').checked = filters.eligibleOnly2;
}
const toggle = (arr, k) => { const i = arr.indexOf(k); i < 0 ? arr.push(k) : arr.splice(i, 1); };

/**
 * 접수기간을 알 수 없는 공고(SH 게시판 등, 일정이 첨부 공고문 안에만 있는 경우)는
 * 접수중·접수예정을 볼 때 함께 보여준다. 빼 버리면 진행 중인 공고를 통째로 놓친다.
 */
const passesAgency = (l) => !filters.agency.length || filters.agency.includes(agencyOf(l));

// 마감된 공고는 일주일 뒤 목록에서 사라진다.
// 데이터 자체는 지우지 않는다 — 지난 공고의 당첨 커트라인이 맞춤 점수 계산에 쓰인다.
const CLOSED_VISIBLE_DAYS = 7;

function withinClosedWindow(a) {
  if (a.status.key !== 'done') return true;
  if (!a.status.until) return false;                    // 마감일을 모르면 오래된 것으로 본다
  return -(dayDiff(a.status.until) ?? 0) <= CLOSED_VISIBLE_DAYS;
}

function passesStatus(a) {
  if (!withinClosedWindow(a)) return false;
  if (!filters.status.length) return true;
  if (filters.status.includes(a.status.key)) return true;
  const wantsOpen = filters.status.includes('live') || filters.status.includes('soon');
  return a.status.key === 'notice' && wantsOpen;
}

/**
 * 자격이 분명히 안 되는 공고인가.
 * 소득·자산 초과, 순위 3순위, 청년 유형인데 나이가 넘은 경우를 본다.
 * 판정할 수 없는 것은 '가능'으로 남겨 둔다 — 놓치는 편이 더 나쁘다.
 */
function clearlyIneligible(l, a) {
  if (a.income?.verdict === 'over') return true;
  const age = futureAge();
  const youthOnly = /청년|대학생/.test(`${l.kindLabel ?? ''} ${l.name ?? ''}`);
  if (youthOnly && age != null && age > 39) return true;
  return false;
}

/** 당첨자 발표·서류심사 안내 같은 후속 공지는 기본으로 감춘다 */
const isRecruit = (l) => !l.noticeKind || l.noticeKind === '모집';
const visibleKind = (l) => filters.showAnnouncements || isRecruit(l);

/** 검색은 공고명·자치구·유형·주소·시행사를 한꺼번에 본다 */
const haystack = (l) =>
  `${l.name} ${l.gu ?? ''} ${l.kindLabel ?? ''} ${l.subType ?? ''} ${l.address ?? ''} ${l.developer ?? ''} ${l.builder ?? ''}`.toLowerCase();
const matchesQuery = (l) => {
  const q = filters.q.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((w) => haystack(l).includes(w));   // 여러 낱말은 모두 포함
};

function renderCorners() {
  const nav = $('#corners'); nav.innerHTML = '';
  // 상태 필터만 적용한 모수로 코너별 건수를 센다 (탭을 눌러도 숫자가 흔들리지 않게)
  const pool = listings.filter((l) =>
    visibleKind(l) && matchesQuery(l) && passesAgency(l) && passesStatus({ status: statusOf(l) }));
  const count = (key) => key === 'all' ? pool.length
    : key === 'scrap' ? listings.filter((l) => scraps.has(l.id)).length
    : pool.filter((l) => cornerOf(l) === key).length;

  const tabs = [
    { key: 'all', label: '전체', icon: '📋', desc: '서울에서 지금 열려 있는 모든 공고입니다.' },
    { key: 'scrap', label: '스크랩', icon: '⭐', desc: '별표를 눌러 담아 둔 공고입니다. 이 브라우저에 저장됩니다.' },
    ...CORNERS,
  ];
  for (const c of tabs) {
    const n = count(c.key);
    const b = el('button', `corner-tab${filters.corner === c.key ? ' on' : ''}${n === 0 ? ' empty' : ''}`,
      `<span>${c.icon}</span><span>${esc(c.label)}</span><span class="n">${n}</span>`);
    b.onclick = () => { filters.corner = c.key; renderAll(); };
    nav.appendChild(b);
  }
  $('#cornerDesc').textContent = tabs.find((c) => c.key === filters.corner)?.desc || '';
}

function visible() {
  return listings
    .map((l) => ({ l, a: analyze(l) }))
    .filter(({ l, a }) => {
      // 스크랩 탭에서는 담아 둔 것을 상태와 무관하게 전부 보여준다
      if (filters.corner === 'scrap') return scraps.has(l.id);
      if (!visibleKind(l)) return false;
      if (!matchesQuery(l)) return false;
      if (!passesAgency(l)) return false;
      if (!passesStatus(a)) return false;
      if (filters.corner !== 'all' && cornerOf(l) !== filters.corner) return false;
      if (filters.gu.length && !(l.gu && filters.gu.includes(l.gu))) return false;
      if (filters.budgetOnly && a.pricedCount > 0 && a.affordable === 0) return false;
      if (filters.eligibleOnly && !a.eligibleSpecial.length) return false;
      if (filters.incomeFitOnly && a.income?.verdict === 'over') return false;
      if (filters.eligibleOnly2 && clearlyIneligible(l, a)) return false;
      return true;
    })
    .sort((x, y) => {
      switch (filters.sort) {
        case 'deadline': {
          const rank = (a) => a.status.key === 'live' ? 0 : a.status.key === 'soon' ? 1 : a.status.key === 'result' ? 2 : 3;
          return (rank(x.a) - rank(y.a)) || ((x.a.status.d ?? 9e9) - (y.a.status.d ?? 9e9));
        }
        case 'recent': return (y.l.noticeDate || '').localeCompare(x.l.noticeDate || '');
        case 'priceAsc': return (x.a.minPrice ?? 9e9) - (y.a.minPrice ?? 9e9);
        case 'cmpetAsc': return (x.a.cmpetAvg ?? 9e9) - (y.a.cmpetAvg ?? 9e9);
        default: return y.a.score - x.a.score;
      }
    });
}

function renderCards() {
  const rows = visible();
  const cards = $('#cards'); cards.innerHTML = '';
  $('#empty').hidden = rows.length > 0;
  if (!rows.length) $('#empty').textContent = listings.length ? '조건에 맞는 공고가 없습니다. 필터를 넓혀 보세요.' : '공고를 불러오는 중입니다…';

  const live = rows.filter((r) => r.a.status.key === 'live').length;
  const soon = rows.filter((r) => r.a.status.key === 'soon').length;
  const fit = rows.filter((r) => r.a.affordable > 0).length;
  $('#summary').innerHTML = `
    <div class="stat"><b>${rows.length}</b><span>표시 중인 공고</span></div>
    <div class="stat"><b style="color:var(--good)">${live}</b><span>지금 접수중</span></div>
    <div class="stat"><b style="color:var(--warn)">${soon}</b><span>접수 예정</span></div>
    <div class="stat"><b>${fit}</b><span>예산 내 타입 있음</span></div>`;

  for (const { l, a } of rows) cards.appendChild(cardOf(l, a));
}

function cardOf(l, a) {
  const c = el('div', 'card');
  const tier = a.score >= 70 ? 'hi' : a.score >= 45 ? 'mid' : 'lo';
  const st = a.status;
  const dText = st.d == null ? '' : st.key === 'live' ? `D-${st.d}` : st.d === 0 ? 'D-DAY' : `D-${st.d}`;

  c.innerHTML = `
    <div class="card-head">
      <div>
        <h3>${esc(l.name)}</h3>
        <div class="where">${esc(l.gu || l.areaName || '서울')} · ${esc(l.subType || l.kindLabel)}${l.totalUnits ? ` · 총 ${num(l.totalUnits)}세대` : ''}</div>
      </div>
      <div class="right">
        <div class="match ${tier}"><b>${a.score}</b><span>맞춤도</span></div>
        <button class="star${scraps.has(l.id) ? ' on' : ''}" title="스크랩" data-scrap="${esc(l.id)}">★</button>
      </div>
    </div>
    <div class="badges">
      <span class="badge ${st.key === 'live' ? 'live' : (st.key === 'soon' || st.key === 'notice') ? 'soon' : 'done'}">${esc(st.label)}${dText ? ` · ${dText}` : ''}</span>
      <span class="badge tag">${esc(l.kindLabel)}</span>
      ${l.noticeKind && l.noticeKind !== '모집' ? `<span class="badge">${esc(l.noticeKind)}</span>` : ''}
      ${l.flags?.priceCap ? '<span class="badge">분양가상한제</span>' : ''}
      ${l.flags?.speculative ? '<span class="badge hot">투기과열</span>' : ''}
      ${a.cmpetAvg != null ? `<span class="badge ${a.cmpetAvg >= 20 ? 'hot' : ''}">경쟁률 ${a.cmpetAvg}:1</span>` : ''}
      ${a.rank?.rank === 1 ? '<span class="verdict ok">1순위</span>'
        : a.rank?.rank === 2 ? '<span class="verdict tight">2순위</span>'
        : a.rank?.rank === 3 ? '<span class="verdict over">3순위</span>' : ''}
      ${a.income?.verdict === 'nolimit' ? '<span class="verdict ok">소득·자산 기준 없음</span>'
        : a.income?.verdict === 'ok' ? `<span class="verdict ok">${a.income.bySolo ? '청년 기준 이내' : '소득 기준 이내'}</span>`
        : a.income?.verdict === 'tight' ? `<span class="verdict tight">${a.income.bySolo ? '청년 기준 아슬아슬' : '소득 기준 아슬아슬'}</span>`
        : a.income?.verdict === 'over' ? `<span class="verdict over">${esc(a.income.assetOver ? a.income.assetOver + ' 초과' : '소득 기준 초과')}</span>` : ''}
    </div>
    <div class="kv">
      <div><span>${a.rental ? '보증금' : '분양가'}</span><b>${a.minPrice != null ? `${eok(a.minPrice)}${a.maxPrice !== a.minPrice ? ` ~ ${eok(a.maxPrice)}` : ''}` : '공고문 참조'}</b></div>
      <div><span>${a.rental ? '월임대료' : '평당가'}</span><b>${a.rental
        ? (a.minMonthly != null ? `${num(a.minMonthly)}만원${a.maxMonthly !== a.minMonthly ? ` ~ ${num(a.maxMonthly)}` : ''}` : '—')
        : (a.pyeong ? `${num(a.pyeong)}만원` : '—')}</b></div>
      <div><span>전용면적</span><b>${a.minArea != null ? `${a.minArea} ~ ${a.maxArea}㎡` : '—'}</b></div>
      <div><span>${st.key === 'notice' ? '공고일' : st.key === 'done' ? '당첨발표' : '주요 일정'}</span><b>${fmtDate(st.until)}</b></div>
    </div>
    <div class="reasons">${a.reasons.slice(0, 3).map((r) => `<span class="reason${r.neg ? ' neg' : ''}">${esc(r.t)}</span>`).join('')}
      ${a.rank?.need ? `<span class="reason neg">${esc(a.rank.need)}</span>` : ''}</div>`;
  if (a.income?.verdict === 'over') c.classList.add('dim');
  c.onclick = (e) => {
    const id = e.target.closest('[data-scrap]')?.dataset.scrap;
    if (id) { e.stopPropagation(); toggleScrap(id); return; }
    openDrawer(l.id);
  };
  return c;
}

// ── 상세 패널 ────────────────────────────────────────────────────────
async function openDrawer(id) {
  const drawer = $('#drawer'); const panel = $('#drawerPanel');
  drawer.hidden = false;
  panel.innerHTML = '<button class="close-x" data-close>✕</button><p style="color:var(--text-3)">불러오는 중…</p>';
  panel.scrollTop = 0;
  const l = listings.find((x) => x.id === id);
  if (!STATIC) {
    try {
      const res = await fetch(`/api/listing?id=${encodeURIComponent(id)}`);
      if (res.ok) Object.assign(l, await res.json());
    } catch { /* 캐시된 내용으로 표시 */ }
  }
  panel.innerHTML = drawerHTML(l, analyze(l));
}

function drawerHTML(l, a) {
  const w = windows(l);
  const budgetManwon = profile.budgetEok * 10000;

  const tl = [
    ...(l.noticeDate ? [{ lbl: '모집공고', from: l.noticeDate, to: l.noticeDate }] : []),
    ...w.map((x) => ({ lbl: x.label, from: x.from, to: x.to })),
    ...(l.resultDate ? [{ lbl: '당첨자 발표', from: l.resultDate, to: l.resultDate }] : []),
    ...(l.contractStart ? [{ lbl: '계약', from: l.contractStart, to: l.contractEnd || l.contractStart }] : []),
  ];

  const models = (l.models || []).slice().sort((x, y) => (x.exclusiveArea ?? 0) - (y.exclusiveArea ?? 0));
  const hasSpecial = models.some((m) => m.specialUnits > 0);

  const priceOf = (m) => (a.rental ? (m.depositManwon ?? m.priceManwon) : m.priceManwon);
  const modelRows = models.map((m) => {
    const price = priceOf(m);
    const fits = price != null && price <= budgetManwon;
    const pp = pyeongPrice(m);
    return `<tr class="${fits ? 'fit' : price != null ? 'over' : ''}">
      <td>${esc(m.houseType)}</td>
      <td>${m.exclusiveArea ?? '—'}</td>
      <td>${num(m.generalUnits)}</td>
      ${hasSpecial ? `<td>${num(m.specialUnits)}</td>` : ''}
      <td><b>${eok(price)}</b></td>
      <td>${a.rental ? (m.monthlyManwon != null ? num(m.monthlyManwon) : '—') : (pp ? num(pp) : '—')}</td>
      <td>${price == null ? '—' : fits ? '✓ 예산 내' : '초과'}</td>
    </tr>`;
  }).join('');

  // 같은 문서의 PDF판이 함께 올라오는 경우가 많다. 웹에서 읽히는 PDF를 위로 올리고,
  // 짝이 있는 한글 파일은 중복임을 밝혀 덜 헷갈리게 한다.
  const fileKey = (n) => n.replace(/\.(pdf|hwpx?|xlsx?|docx?|zip)$/i, '').replace(/[\s_()\[\]]/g, '').toLowerCase();
  const raw = l.attachments || [];
  const pdfKeys = new Set(raw.filter((f) => /\.pdf$/i.test(f.name)).map((f) => fileKey(f.name)));
  const files = [...raw].sort((a, b) => {
    const rank = (f) => (/\.pdf$/i.test(f.name) ? 0 : pdfKeys.has(fileKey(f.name)) ? 2 : 1);
    return rank(a) - rank(b);
  });

  const filesSection = files.length ? `<section><h3>공고문 첨부</h3><div class="files">${files.map((f) => {
    const pdf = /\.pdf(\?|$)/i.test(f.url) || /\.pdf$/i.test(f.name);
    const hwp = /\.hwpx?(\?|$)/i.test(f.url) || /\.hwpx?$/i.test(f.name);
    // 기관 서버가 첨부를 모두 attachment로 내려보내 브라우저 미리보기가 막힌다.
    // PDF는 구글 뷰어를 거쳐 웹에서 바로 읽고, 한글 파일은 그대로 내려받는다.
    // 기관이 문서뷰어를 제공하면(SH) 그대로 쓰고, 아니면 PDF만 구글 뷰어를 거친다
    const href = f.viewer ? f.url
      : pdf ? `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(f.url)}` : f.url;
    return `<a class="file" href="${esc(href)}" target="_blank" rel="noopener">
      <span class="ico">${pdf ? '📕' : hwp ? '📘' : '📄'}</span>
      <span class="nm">${esc(f.name)}${!pdf && pdfKeys.has(fileKey(f.name)) ? ' <span class="dupe">· 위 PDF와 같은 문서</span>' : ''}</span>
      <span class="go">${f.viewer || pdf ? '미리보기' : '내려받기'} ↗</span>
      ${pdf && !f.viewer ? `<span class="alt" data-dl="${esc(f.url)}" title="파일로 내려받기">⤓</span>` : ''}
    </a>`;
  }).join('')}</div></section>` : '';

  const cmpetRows = (l.cmpet || []).map((r) => `<tr>
      <td>${esc(r.HOUSE_TY || '—')}</td>
      <td>${esc(r.RESIDE_SENM || r.SPSPLY_KND_NM || r.RESIDNT_PRIOR_SENM || '—')}</td>
      <td>${esc(r.SUBSCRPT_RANK_CODE ? r.SUBSCRPT_RANK_CODE + '순위' : '—')}</td>
      <td>${num(Number(r.SUPLY_HSHLDCO ?? r.SPSPLY_KND_HSHLDCO))}</td>
      <td>${num(Number(r.REQ_CNT))}</td>
      <td><b>${esc(r.CMPET_RATE ?? '—')}</b></td>
    </tr>`).join('');

  const scoreRows = (l.score || []).map((r) => `<tr>
      <td>${esc(r.HOUSE_TY)}</td><td>${esc(r.RESIDE_SENM || '—')}</td>
      <td>${esc(r.LWET_SCORE)}</td><td>${esc(r.AVRG_SCORE)}</td><td>${esc(r.TOP_SCORE)}</td>
      <td>${Number(r.LWET_SCORE) > 0 ? (a.myScore >= Number(r.LWET_SCORE) ? '<b style="color:var(--good)">내 가점 통과</b>' : `<span style="color:var(--hot)">${Number(r.LWET_SCORE) - a.myScore}점 부족</span>`) : '—'}</td>
    </tr>`).join('');

  const spOffered = SPECIAL_TYPES.filter((t) => models.some((m) => (m.special?.[t.field] || 0) > 0));

  return `
  <button class="close-x" data-close>✕</button>
  <h2>${esc(l.name)}
    <button class="star${scraps.has(l.id) ? ' on' : ''}" title="스크랩" data-scrap="${esc(l.id)}">★</button>
  </h2>
  <p class="lead small">${esc(l.address || '')}</p>
  <div class="badges" style="margin-top:10px">
    <span class="badge ${a.status.key === 'live' ? 'live' : (a.status.key === 'soon' || a.status.key === 'notice') ? 'soon' : 'done'}">${esc(a.status.label)}</span>
    <span class="badge tag">${esc(l.kindLabel)}${l.subType ? ' · ' + esc(l.subType) : ''}</span>
    ${l.totalUnits ? `<span class="badge">총 ${num(l.totalUnits)}세대</span>` : ''}
    ${l.flags?.priceCap ? '<span class="badge">분양가상한제</span>' : ''}
    ${l.flags?.speculative ? '<span class="badge hot">투기과열지구</span>' : ''}
    ${l.flags?.regulated ? '<span class="badge hot">조정대상지역</span>' : ''}
  </div>

  ${a.rank ? `<section>
    <h3>일반공급 순위</h3>
    <p class="lead small">
      ${a.rank.rank ? `<span class="verdict ${a.rank.rank === 1 ? 'ok' : a.rank.rank === 2 ? 'tight' : 'over'}">${esc(a.rank.label)}</span>` : `<span class="verdict tight">${esc(a.rank.label)}</span>`}
      &nbsp; ${esc(a.rank.why)}
      ${a.rank.need ? `<br><span class="fineprint">${esc(a.rank.need)}</span>` : ''}
    </p>
  </section>` : ''}

  ${a.income?.verdict === 'nolimit' ? `<section>
    <h3>소득 · 자산 기준</h3>
    <p class="lead small"><span class="verdict ok">기준 없음</span> &nbsp; ${esc(a.income.note ?? '')}</p>
  </section>` : ''}

  ${a.income && a.income.verdict !== 'unknown' && a.income.verdict !== 'nolimit' ? `<section>
    <h3>소득 · 자산 기준</h3>
    <p class="lead small">
      <span class="verdict ${a.income.verdict}">${a.income.verdict === 'ok' ? '기준 이내' : a.income.verdict === 'tight' ? '아슬아슬' : '초과'}</span>
      &nbsp; ${a.income.bySolo ? '본인 소득' : '세대 소득'} <b>${a.income.myPercent}%</b> · ${esc(a.income.rule ?? '')} 기준 <b>${a.income.thresholdPercent}%</b>
      ${a.income.thresholdWon ? `(월 ${a.income.thresholdWon.toLocaleString('ko-KR')}원)` : ''}
      ${a.income.assetOver ? `<br><b>${esc(a.income.assetOver)} 한도를 넘습니다.</b>` : ''}
      ${a.income.bySolo ? '<br><span class="fineprint">이 유형의 청년 계층은 본인 소득만 보므로 1인가구 기준으로 계산했습니다.</span>' : ''}
      ${a.income.newbornBonusPct ? `<br><span class="fineprint">출산자녀 가산으로 기준이 ${a.income.newbornBonusPct}%p 올라간 값입니다.</span>` : ''}
      ${a.income.assetLimit != null ? `<br><span class="fineprint">${a.income.assetBySolo ? '본인' : '세대'} 총자산 한도 ${a.income.assetLimit.toLocaleString('ko-KR')}만원${a.income.carLimit ? ` · 자동차 ${a.income.carLimit.toLocaleString('ko-KR')}만원` : ''}</span>` : ''}
    </p>
    ${a.income.note ? `<p class="fineprint">${esc(a.income.note)}</p>` : ''}
    <p class="fineprint">${STD?.urban?.year ?? ''}년 공표 기준(${esc(a.income.basis ?? '')})으로 계산했습니다. 공고마다 우선공급 계층·면적별 예외가 있으니 최종 자격은 공고문을 확인하세요.
      ${a.income.source ? `<a href="${esc(a.income.source)}" target="_blank" rel="noopener">기준 출처 ↗</a>` : ''}</p>
  </section>` : ''}

  <section>
    <h3>내 조건 맞춤도 ${a.score}점</h3>
    <div class="reasons">${a.reasons.map((r) => `<span class="reason${r.neg ? ' neg' : ''}">${esc(r.t)}</span>`).join('')}</div>
    ${spOffered.length ? `<p class="lead small" style="margin-top:10px">이 단지의 특별공급: ${spOffered.map((t) => esc(t.label)).join(' · ')}</p>` : ''}
  </section>

  <section>
    <h3>청약 일정</h3>
    <div class="timeline">${tl.map((t) => {
      const cls = t.to < TODAY ? 'past' : (t.from <= TODAY && TODAY <= t.to) ? 'now' : 'next';
      const d = dayDiff(t.from);
      const dd = cls === 'next' ? ` · D-${d}` : cls === 'now' ? ' · 진행중' : '';
      return `<div class="tl ${cls}"><div class="dot"></div><div class="lbl">${esc(t.lbl)}${dd}</div>
        <div class="dt">${fmtDate(t.from)}${t.to !== t.from ? ` ~ ${fmtDate(t.to)}` : ''}</div></div>`;
    }).join('')}</div>
    ${l.moveIn ? `<p class="lead small" style="margin-top:8px">입주 예정 ${esc(l.moveIn.replace(/^(\d{4})(\d{2})$/, '$1년 $2월'))}</p>` : ''}
  </section>

  ${filesSection}

  <section>
    <h3>${a.rental ? '주택형별 공급 · 임대조건' : '주택형별 공급 · 분양가'}</h3>
    ${models.length ? `<div class="tablewrap"><table>
      <thead><tr><th>주택형</th><th>전용㎡</th><th>${a.rental ? '세대수' : '일반'}</th>${hasSpecial ? '<th>특공</th>' : ''}<th>${a.rental ? '보증금' : '분양가'}</th><th>${a.rental ? '월세(만)' : '평당(만)'}</th><th>내 예산</th></tr></thead>
      <tbody>${modelRows}</tbody></table></div>` : '<p class="lead small">주택형 정보가 아직 없습니다.</p>'}
  </section>

  ${cmpetRows ? `<section><h3>청약 경쟁률</h3><div class="tablewrap"><table>
    <thead><tr><th>주택형</th><th>구분</th><th>순위</th><th>공급</th><th>접수</th><th>경쟁률</th></tr></thead>
    <tbody>${cmpetRows}</tbody></table></div></section>` : ''}

  ${scoreRows ? `<section><h3>당첨 가점 (내 가점 ${a.myScore}점)</h3><div class="tablewrap"><table>
    <thead><tr><th>주택형</th><th>지역</th><th>최저</th><th>평균</th><th>최고</th><th>판정</th></tr></thead>
    <tbody>${scoreRows}</tbody></table></div></section>` : ''}

  <section>
    <h3>사업 정보</h3>
    <div class="kv" style="grid-template-columns:repeat(2,1fr);gap:10px">
      ${l.developer ? `<div><span>시행사</span><b>${esc(l.developer)}</b></div>` : ''}
      ${l.builder ? `<div><span>시공사</span><b>${esc(l.builder)}</b></div>` : ''}
      ${l.tel ? `<div><span>문의</span><b>${esc(l.tel)}</b></div>` : ''}
      ${l.noticeDate ? `<div><span>모집공고일</span><b>${fmtDate(l.noticeDate)}</b></div>` : ''}
    </div>
    <p style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      ${l.noticeUrl ? `<a href="${esc(l.noticeUrl)}" target="_blank" rel="noopener">${l.source === 'LH' ? 'LH 공고 원문' : '청약홈 공고 원문'} ↗</a>` : ''}
      ${l.homepage ? `<a href="${esc(l.homepage)}" target="_blank" rel="noopener">분양 홈페이지 ↗</a>` : ''}
    </p>
  </section>`;
}

// ── 프로필 모달 ──────────────────────────────────────────────────────
function openProfile() {
  setVal('#pBirth', profile.birthYm || '');
  setVal('#pMarriage', profile.marriageDate || '');
  setVal('#pNoHouseSince', profile.noHouseSince || '');
  setVal('#pAccountYm', profile.accountYm || '');
  setVal('#pFamily', profile.family);
  setVal('#pHousehold', profile.householdCount ?? '');
  setVal('#pNewborn', profile.newbornCount ?? '');
  setVal('#pPayments', profile.payments ?? '');
  setVal('#pDeposit', profile.depositManwon ?? '');
  setVal('#pIncome', profile.incomeManwon ?? '');
  setVal('#pSolo', profile.soloIncomeManwon ?? '');
  setVal('#pSoloAsset', profile.soloAssetManwon ?? '');
  setVal('#pRealEstate', profile.realEstateManwon ?? '');
  setChk('#pDual', !!profile.dualIncome);
  setVal('#pAsset', profile.assetManwon ?? '');
  setVal('#pCar', profile.carManwon ?? '');
  setVal('#pBudget', profile.budgetEok);
  setVal('#pAreaMin', profile.areaMin);
  setVal('#pAreaMax', profile.areaMax);
  setChk('#pSeoulResident', profile.seoulResident);
  try {
    renderProfileChips();
    renderIncomeSrc();
    updateScoreOut();
    updateIncomeOut();
  } catch (e) {
    console.error('내 조건 창을 채우다 실패했습니다', e);   // 창은 그래도 연다
  }
  $('#profileModal').hidden = false;
}

// 칩만 다시 그린다 — 입력 중인 숫자 필드 값을 건드리지 않기 위해
function renderProfileChips() {
  chipRow($('#pSpecial'), SPECIAL_TYPES, profile.special, (k) => { toggle(profile.special, k); renderProfileChips(); });
  chipRow($('#pGu'), SEOUL_GU.map((g) => ({ key: g, label: g })), profile.gu, (k) => { toggle(profile.gu, k); renderProfileChips(); });
}

function formFromModal() {
  return {
    birthYm: valOf('#pBirth'),
    marriageDate: valOf('#pMarriage'),
    noHouseSince: valOf('#pNoHouseSince'),
    accountYm: valOf('#pAccountYm'),
    family: +valOf('#pFamily') || 0,
    householdCount: valOf('#pHousehold') === '' ? null : Number(valOf('#pHousehold')),
    newbornCount: valOf('#pNewborn') === '' ? 0 : Number(valOf('#pNewborn')),
    payments: valOf('#pPayments') === '' ? null : Number(valOf('#pPayments')),
    depositManwon: valOf('#pDeposit') === '' ? null : Number(valOf('#pDeposit')),
  };
}

function updateIncomeOut() {
  const box = $('#incomeOut');
  if (!STD?.urban?.base) { box.textContent = '소득 기준표를 아직 불러오지 못했습니다.'; return; }
  const num = (id) => { const v = valOf('#' + id); return v === '' ? null : Number(v); };
  const size = Math.max(1, Number(valOf('#pHousehold')) || (Number(valOf('#pFamily')) || 0) + 1);
  const u = STD.urban.base, m = STD.median?.base;
  const uBase = u[Math.min(size, Math.max(...Object.keys(u).map(Number)))];
  const tier = Std.guessTier({ ageYears: myAgeYears(), special: profile.special });

  const hh = num('pIncome'), solo = num('pSolo');
  if (hh == null && solo == null) {
    box.innerHTML = `소득을 넣으면 공고마다 기준 대비 위치를 보여줍니다.
      <span class="sub">${STD.urban.year}년 기준 · ${size}인가구 도시근로자 100% = ${uBase.toLocaleString('ko-KR')}원
      ${m ? ` · 중위소득 100% = ${(m[Math.min(size, Math.max(...Object.keys(m).map(Number)))]).toLocaleString('ko-KR')}원` : ''}</span>`;
    return;
  }

  const lines = [];
  if (hh != null) {
    lines.push(`세대 기준 <b>도시근로자 약 ${Math.round(hh * 10000 / uBase * 100)}%</b>` +
      (m ? ` · <b>중위소득 약 ${Math.round(hh * 10000 / m[Math.min(size, Math.max(...Object.keys(m).map(Number)))] * 100)}%</b>` : ''));
  }
  if (solo != null && u[1]) {
    lines.push(`본인 기준 <b>도시근로자 약 ${Math.round(solo * 10000 / u[1] * 100)}%</b> <span class="hint">(1인가구 기준)</span>`);
  }
  box.innerHTML = `${lines.join('<br>')}
    <span class="sub">${STD.urban.year}년 기준 · ${size}인가구 · 계층 판정: ${esc(tier)}<br>
    행복주택 ${size === 1 ? 120 : size === 2 ? 110 : 100}% · 국민임대 ${size === 1 ? 90 : size === 2 ? 80 : 70}% ·
    청년안심주택 120% · 통합공공임대 중위 ${150 + (size === 1 ? 20 : size === 2 ? 10 : 0)}%</span>`;
}

function updateScoreOut() {
  const p = formFromModal();
  const nh = noHouseYearsOf(p), ac = accountYearsOf(p);
  const start = noHouseStart(p);
  const yr = (v) => `${Math.floor(v)}년 ${Math.round((v % 1) * 12)}개월`;
  const note = !p.birthYm
    ? '생년월을 넣으면 무주택 기간이 자동으로 계산됩니다.'
    : start > new Date()
      ? `만 30세(${start.getFullYear()}.${String(start.getMonth() + 1).padStart(2, '0')})가 되면 무주택 기간이 쌓이기 시작합니다.`
      : `무주택 기산일 ${localISO(start)} · ${yr(nh)}${p.accountYm ? ` / 통장 ${yr(ac)}` : ''}`;
  $('#scoreOut').innerHTML =
    `총 <b>${totalScore(p)}점</b> &nbsp;·&nbsp; 무주택 ${noHouseScore(nh)} + 통장 ${accountScore(ac)} + 부양가족 ${familyScore(p.family)}
     <span class="sub">${esc(note)}</span>`;
}

// ── 메일 알림 설정 ───────────────────────────────────────────────────
function openMail() {
  $('#mPrice').value = watchCfg['최대분양가_억'];
  $('#mDeposit').value = watchCfg['최대보증금_억'];
  $('#mAreaMin').value = watchCfg['전용면적_최소'];
  $('#mAreaMax').value = watchCfg['전용면적_최대'];
  $('#mUnpriced').checked = watchCfg['가격정보없어도_알림'] !== false;
  const u = Sync.user();
  $('#mSubscribe').checked = notifyEmail;
  $('#mSubscribe').disabled = !u;
  // 계정에 이메일이 없으면(카카오) 받을 주소를 직접 받는다
  $('#mEmailRow').hidden = !u || !!u.email;
  $('#mEmail').value = alertEmail || '';
  renderMailChips();
  $('#mailMsg').textContent = '';
  $('#mailMsg').className = 'msg';
  $('#mailManual').hidden = true;
  $('#mailModal').hidden = false;
}

function renderMailChips() {
  chipRow($('#mCorners'), CORNERS.map((c) => ({ key: c.key, label: `${c.icon} ${c.label}` })),
    watchCfg['코너'], (k) => { toggle(watchCfg['코너'], k); renderMailChips(); });
  chipRow($('#mGu'), SEOUL_GU.map((g) => ({ key: g, label: g })),
    watchCfg['관심자치구'], (k) => { toggle(watchCfg['관심자치구'], k); renderMailChips(); });
}

function collectMail() {
  return {
    ...watchCfg,
    '최대분양가_억': +$('#mPrice').value || 0,
    '최대보증금_억': +$('#mDeposit').value || 0,
    '전용면적_최소': +$('#mAreaMin').value || 0,
    '전용면적_최대': +$('#mAreaMax').value || 999,
    '가격정보없어도_알림': $('#mUnpriced').checked,
    '모집공고만': true,
  };
}

async function saveMail() {
  watchCfg = collectMail();
  localStorage.setItem('cheongyak.watch', JSON.stringify(watchCfg));
  notifyEmail = $('#mSubscribe').checked;
  localStorage.setItem('cheongyak.notifyEmail', notifyEmail ? '1' : '0');
  alertEmail = $('#mEmail').value.trim();
  localStorage.setItem('cheongyak.alertEmail', alertEmail);
  if (notifyEmail && !Sync.user()?.email && !alertEmail) {
    const m = $('#mailMsg'); m.className = 'msg err';
    m.textContent = '알림을 받으려면 이메일 주소를 입력해 주세요.';
    return;
  }
  schedulePush();
  const msg = $('#mailMsg');

  if (STATIC) {
    // 정적 사이트에는 저장할 서버가 없다 — 붙여 넣을 내용을 보여 준다
    msg.className = 'msg';
    msg.textContent = '이 사이트에는 저장할 서버가 없습니다. 아래 내용을 watch.json에 넣어 주세요.';
    $('#mailJson').textContent = JSON.stringify(watchCfg, null, 2);
    $('#mailManual').hidden = false;
    $('#mailManual').open = true;
    return;
  }
  try {
    const res = await fetch('/api/watch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(watchCfg),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || '저장 실패');
    msg.className = 'msg ok';
    msg.textContent = 'watch.json에 저장했습니다. 자동 동기화가 곧 GitHub에 올려 다음 갱신부터 반영됩니다.'
      + (Sync.user() ? ' 계정에도 저장했습니다.' : '');
  } catch (e) {
    msg.className = 'msg err';
    msg.textContent = `저장하지 못했습니다: ${e.message}`;
    $('#mailJson').textContent = JSON.stringify(watchCfg, null, 2);
    $('#mailManual').hidden = false;
  }
}

// ── 데이터 로드 ──────────────────────────────────────────────────────
async function load(refresh = false) {
  $('#status').textContent = refresh ? '청약홈에서 다시 가져오는 중…' : '불러오는 중…';

  let data;
  if (STATIC) {
    // 정적 배포: 빌드 시점 스냅샷을 읽는다
    const res = await fetch('data/listings.json', { cache: 'no-cache' });
    if (!res.ok) { $('#status').textContent = '데이터를 불러오지 못했습니다.'; return; }
    data = await res.json();
  } else {
    const res = await fetch(`/api/listings${refresh ? '?refresh=1' : ''}`);
    if (res.status === 428) { showSetup(); return; }
    data = await res.json();
    if (!res.ok) { $('#status').textContent = `오류: ${data.error}`; return; }
  }

  if (Array.isArray(data.corners) && data.corners.length) CORNERS = data.corners;
  if (data.standards) STD = data.standards;
  if (data.watch && !localStorage.getItem('cheongyak.watch')) watchCfg = { ...DEFAULT_WATCH, ...data.watch };
  listings = data.listings || [];
  meta = data;
  cutlineCache = null;

  const t = new Date(data.builtAt || data.fetchedAt);
  const auto = STATIC ? ' · 30분마다 자동 재빌드' : (data.autoRefreshMinutes ? ` · ${data.autoRefreshMinutes}분마다 자동 갱신` : '');
  $('#status').textContent = `서울 공고 ${listings.length}건 · ${t.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} 기준${auto}`;

  renderSources(data.sources);

  const banner = $('#banner');
  const notes = [...(data.errors || [])];
  if (data.enriching) notes.push(`상세 정보(분양가·경쟁률) 수집 중 ${data.progress.done}/${data.progress.total} — 잠시 후 자동 갱신됩니다.`);
  banner.hidden = !notes.length;
  banner.textContent = notes.join('  |  ');

  renderAll();
  schedulePoll(data.enriching ? 6000 : POLL_MS);
}

// 서버가 주기적으로 새로 받아오므로, 화면도 알아서 따라간다
const POLL_MS = 3 * 60 * 1000;
let pollTimer = null;
function schedulePoll(ms) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => load(false), ms);
}
// 탭으로 돌아오면 즉시 한 번 맞춘다
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });

function renderSources(sources) {
  const box = $('#sources');
  if (!Array.isArray(sources) || !sources.length) { box.hidden = true; return; }
  box.hidden = false;
  const off = sources.filter((s) => !s.ok).length;
  box.querySelector('summary').textContent = off
    ? `데이터 연결 상태 — ${sources.length}개 중 ${off}개 미연결 (활용신청 필요)`
    : `데이터 연결 상태 — ${sources.length}개 모두 연결됨`;
  if (off) box.open = true;

  $('#sourceList').innerHTML = sources.map((s) => `
    <div class="source${s.ok ? '' : ' off'}">
      <span class="dot">${s.ok ? '🟢' : '🟡'}</span>
      <div>
        <div class="nm">${esc(s.name)}</div>
        <div class="use">${esc(s.use)}</div>
        <div class="org">${esc(s.org)}${s.required ? ' · 필수' : ''}${s.scraped ? ' · 게시판 직접 수집' : ''}</div>
      </div>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">${s.scraped ? '원본 ↗' : s.ok ? '문서 ↗' : '활용신청 ↗'}</a>
    </div>`).join('');
}

function renderAll() { renderMeCard(); renderCorners(); renderFilters(); renderCards(); }

function showSetup() { $('#setup').hidden = false; $('#app').hidden = true; }
function showApp() { $('#setup').hidden = true; $('#app').hidden = false; }

// ── 로그인 · 기기 간 동기화 ──────────────────────────────────────────
let notifyEmail = localStorage.getItem('cheongyak.notifyEmail') === '1';
// 카카오 로그인은 이메일을 주지 않으므로 알림용 주소를 따로 받는다
let alertEmail = localStorage.getItem('cheongyak.alertEmail') || '';
let syncTimer = null;

function renderAuth(u) {
  $('#btnAuth').textContent = u ? Sync.displayName().split('@')[0] : '로그인';
  $('#authedBox').hidden = !u;
  $('#anonBox').hidden = !!u;
  if (u) $('#authEmail').textContent = Sync.displayName() + (u.email ? '' : ' (카카오 · 이메일 없음)');
}

/** 로컬 변경을 서버에 반영 — 잦은 저장을 모아서 한 번에 보낸다 */
function schedulePush() {
  if (!Sync.user()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await Sync.push({ profile, scraps: [...scraps], watch: watchCfg, notifyEmail, email: alertEmail });
    } catch (e) { console.warn('동기화 실패:', e.message); }
  }, 1200);
}

/** 서버 설정을 받아 화면에 반영 */
async function pullAndApply() {
  const row = await Sync.pull();
  if (!row) { schedulePush(); return '이 계정의 첫 동기화입니다 — 지금 설정을 올렸습니다.'; }
  if (row.profile && Object.keys(row.profile).length) {
    profile = { ...DEFAULT_PROFILE, ...row.profile };
    saveProfile();
  }
  if (Array.isArray(row.scraps)) { scraps = new Set(row.scraps); saveScraps(); }
  if (row.watch && Object.keys(row.watch).length) {
    watchCfg = { ...DEFAULT_WATCH, ...row.watch };
    localStorage.setItem('cheongyak.watch', JSON.stringify(watchCfg));
  }
  notifyEmail = !!row.notify_email;
  localStorage.setItem('cheongyak.notifyEmail', notifyEmail ? '1' : '0');
  if (row.email) { alertEmail = row.email; localStorage.setItem('cheongyak.alertEmail', alertEmail); }
  renderAll();
  return `불러왔습니다 — 스크랩 ${scraps.size}건.`;
}

function openAuth() {
  renderAuth(Sync.user());
  // 카카오가 아직 안 켜져 있으면 눌러도 오류 화면으로 가므로 미리 알린다
  const kakaoOn = Sync.hasProvider('kakao');
  $('#btnKakao').disabled = !kakaoOn;
  $('#btnKakao').style.opacity = kakaoOn ? '1' : '.45';
  $('#btnKakao').title = kakaoOn ? '' : '카카오 로그인은 아직 설정 전입니다';
  $('#authMsg').textContent = ''; $('#authMsg').className = 'msg';
  $('#syncMsg').textContent = ''; $('#syncMsg').className = 'msg';
  $('#authModal').hidden = false;
}

// ── 이벤트 ───────────────────────────────────────────────────────────
$('#keySave').onclick = async () => {
  const msg = $('#keyMsg'); msg.className = 'msg'; msg.textContent = '확인 중…';
  const res = await fetch('/api/key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceKey: $('#keyInput').value }),
  });
  const data = await res.json();
  if (!res.ok) { msg.className = 'msg err'; msg.textContent = data.error; return; }
  msg.className = 'msg ok'; msg.textContent = '연결됐습니다. 공고를 불러옵니다…';
  showApp(); load(true);
};
$('#keyInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#keySave').click(); });

$('#btnRefresh').onclick = () => load(true);   // 목록만 다시 받기 (빠름)
if ($('#btnProfile')) $('#btnProfile').onclick = openProfile;
$('#btnMail').onclick = openMail;
$('#btnAuth').onclick = openAuth;

$('#btnMagic').onclick = async () => {
  const msg = $('#authMsg'); const email = $('#authEmailInput').value.trim();
  if (!email) { msg.className = 'msg err'; msg.textContent = '이메일을 입력해 주세요.'; return; }
  msg.className = 'msg'; msg.textContent = '보내는 중…';
  try {
    await Sync.signInWithEmail(email);
    msg.className = 'msg ok';
    msg.textContent = `${email} 로 로그인 링크를 보냈습니다. 메일함을 확인하세요.`;
  } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
};

$('#btnKakao').onclick = async () => {
  const msg = $('#authMsg');
  try { await Sync.signInWithKakao(); }
  catch (e) {
    msg.className = 'msg err';
    msg.textContent = /provider is not enabled/i.test(e.message)
      ? '카카오 로그인이 아직 켜져 있지 않습니다. 아래 이메일 로그인을 쓰거나 설정을 마쳐 주세요.'
      : e.message;
  }
};

$('#btnSignOut').onclick = async () => { await Sync.signOut(); renderAuth(null); };

$('#btnSyncNow').onclick = async () => {
  const msg = $('#syncMsg'); msg.className = 'msg'; msg.textContent = '동기화 중…';
  try { msg.className = 'msg ok'; msg.textContent = await pullAndApply(); }
  catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
};
$('#mSave').onclick = saveMail;
$('#mailCopy').onclick = () => navigator.clipboard?.writeText($('#mailJson').textContent);
$('#fSort').onchange = (e) => { filters.sort = e.target.value; renderCards(); };
$('#fBudget').onchange = (e) => { filters.budgetOnly = e.target.checked; renderCards(); };
$('#fEligible').onchange = (e) => { filters.eligibleOnly = e.target.checked; renderCards(); };
$('#fAnnounce').onchange = (e) => { filters.showAnnouncements = e.target.checked; renderAll(); };
$('#fIncomeFit').onchange = (e) => { filters.incomeFitOnly = e.target.checked; renderCards(); };
$('#fEligibleOnly').onchange = (e) => { filters.eligibleOnly2 = e.target.checked; renderCards(); };
let searchTimer = null;
$('#fSearch').oninput = (e) => {
  filters.q = e.target.value;
  $('#fSearchClear').hidden = !filters.q;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderAll, 180);   // 타이핑이 멈추면 그린다
};
$('#fSearchClear').onclick = () => { $('#fSearch').value = ''; filters.q = ''; $('#fSearchClear').hidden = true; renderAll(); };

$('#fReset').onclick = () => {
  filters = { status: ['live', 'soon', 'result', 'notice'], corner: 'all', gu: [], agency: [], q: '', sort: 'match', budgetOnly: false, eligibleOnly: false, showAnnouncements: false, incomeFitOnly: false };
  $('#fSearch').value = '';
  $('#fSearchClear').hidden = true;
  renderAll();
};

for (const id of ['pBirth', 'pMarriage', 'pNoHouseSince', 'pAccountYm', 'pFamily']) {
  on('#' + id, 'input', updateScoreOut);
}
for (const id of ['pIncome', 'pSolo', 'pFamily', 'pHousehold', 'pBirth', 'pDual']) {
  on('#' + id, 'input', updateIncomeOut);
}

$('#pSave').onclick = () => {
  profile = {
    ...profile,
    ...formFromModal(),
    incomeManwon: valOf('#pIncome') === '' ? null : Number(valOf('#pIncome')),
    soloIncomeManwon: valOf('#pSolo') === '' ? null : Number(valOf('#pSolo')),
    soloAssetManwon: valOf('#pSoloAsset') === '' ? null : Number(valOf('#pSoloAsset')),
    realEstateManwon: valOf('#pRealEstate') === '' ? null : Number(valOf('#pRealEstate')),
    dualIncome: chkOf('#pDual'),
    assetManwon: valOf('#pAsset') === '' ? null : Number(valOf('#pAsset')),
    carManwon: valOf('#pCar') === '' ? null : Number(valOf('#pCar')),
    budgetEok: +valOf('#pBudget') || 0,
    areaMin: +valOf('#pAreaMin') || 0,
    areaMax: +valOf('#pAreaMax') || 999,
    seoulResident: chkOf('#pSeoulResident'),
  };
  cutlineCache = null;   // 거주지 기준이 바뀌면 커트라인도 다시 잡는다
  saveProfile();
  schedulePush();
  $('#profileModal').hidden = true;
  renderAll();
};

/** 열려 있는 모달·상세 패널을 모두 닫는다. 모달을 새로 만들어도 여기 손댈 일이 없다. */
function closeOverlays() {
  for (const el of document.querySelectorAll('.modal, .drawer')) el.hidden = true;
}

document.addEventListener('click', (e) => {
  const dl = e.target.closest('[data-dl]');
  if (dl) { e.preventDefault(); e.stopPropagation(); window.open(dl.dataset.dl, '_blank', 'noopener'); return; }
  const scrapBtn = e.target.closest('#drawerPanel [data-scrap]');
  if (scrapBtn) { toggleScrap(scrapBtn.dataset.scrap); scrapBtn.classList.toggle('on'); return; }
  // 닫기 버튼 안의 아이콘을 눌러도 닫히도록 closest로 찾는다
  if (e.target.closest('[data-close]')) closeOverlays();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeOverlays();
});

// ── 시작 ─────────────────────────────────────────────────────────────
(async () => {
  Sync.initAuth(async (u) => {
    renderAuth(u);
    if (u) { try { await pullAndApply(); } catch (e) { console.warn(e.message); } }
  });

  if (STATIC) {
    $('#btnRefresh').hidden = true;   // 정적 배포에는 서버가 없다
    showApp(); renderMeCard(); load(false);
    return;
  }
  const h = await (await fetch('/api/health')).json();
  if (!h.hasKey) { showSetup(); return; }
  showApp(); renderMeCard(); load(false);
})();
