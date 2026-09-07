// 서울 청약 대시보드 — 프론트엔드

const $ = (s) => document.querySelector(s);
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
  { key: 'publicrent', label: '공공지원 민간임대', icon: '🤝', kinds: ['RENT'], desc: '시세보다 낮은 임대료로 8~10년 거주. 청년·신혼부부 우선공급이 있습니다.' },
  { key: 'lhsale', label: '공공분양·신혼희망타운', icon: '🌱', kinds: ['LH_SALE', 'MYHOME_SALE'], desc: 'LH·SH·지방공사가 공급하는 공공분양과 신혼희망타운. 소득·자산 요건이 붙습니다.' },
  { key: 'lhrent', label: '공공임대주택', icon: '🏠', kinds: ['LH_RENT', 'MYHOME_RENT'], desc: '행복주택·국민임대·영구임대·통합공공임대·매입/전세임대. 소득·자산 기준으로 뽑고, 부모님이 60세 이상이어도 유주택으로 봅니다.' },
  { key: 'sh', label: 'SH 서울주택도시공사', icon: '🏙️', kinds: ['SH'], desc: '장기전세·청년안심주택·행복주택·매입임대·미리내집 등. SH는 공고 API가 없어 공고 게시판을 직접 읽어옵니다 — 일정·조건은 공고 원문을 확인하세요.' },
  { key: 'hug', label: 'HUG 든든전세', icon: '🛡️', kinds: ['HUG'], desc: 'HUG가 전세보증금을 대신 갚고 매입한 주택을 공공임대로 공급합니다. 소득·자산 기준이 없고 무주택세대구성원이면 신청할 수 있습니다.' },
  { key: 'welfare', label: '주거복지', icon: '💚', kinds: ['LH_WELFARE'], desc: '주거취약계층·고령자 등 대상 주거지원 공고.' },
];
let CORNERS = DEFAULT_CORNERS;

// 임대 공고는 분양가가 아니라 보증금·월세로 읽어야 한다
const RENTAL_KINDS = ['RENT', 'LH_RENT', 'LH_WELFARE', 'MYHOME_RENT', 'SH', 'HUG'];
const isRental = (l) => RENTAL_KINDS.includes(l.kind);
const cornerOf = (l) => l.corner || CORNERS.find((c) => c.kinds.includes(l.kind))?.key || 'apt';

const STATUSES = [
  { key: 'live', label: '접수중' },
  { key: 'soon', label: '접수예정' },
  { key: 'result', label: '발표대기' },
  { key: 'notice', label: '공고 확인' },
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
function totalScore(p) { return noHouseScore(noHouseYearsOf(p)) + accountScore(accountYearsOf(p)) + familyScore(p.family); }

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
  if (!w.length && l.scheduleUnknown) return { key: 'notice', label: '공고 게시 — 일정은 원문 확인', until: l.noticeDate, d: null };
  return { key: 'done', label: '접수 마감', until: w.at(-1)?.to || l.receiptEnd, d: null };
}

// ── 프로필 ───────────────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  birthYm: '', marriageDate: '', noHouseSince: '', accountYm: '', family: 0,
  budgetEok: 9, areaMin: 49, areaMax: 99,
  special: [], gu: [], seoulResident: true,
};
let profile = { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem('cheongyak.profile') || '{}') };
const saveProfile = () => localStorage.setItem('cheongyak.profile', JSON.stringify(profile));

let filters = { status: ['live', 'soon', 'result', 'notice'], corner: 'all', gu: [], sort: 'match', budgetOnly: false, eligibleOnly: false };
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
  const reasons = [];
  let score = 0;

  // 예산 (35)
  if (!priced.length) { score += 12; reasons.push({ t: rental ? '임대조건 공고문 확인' : '분양가 미공개' }); }
  else if (!affordable.length) { reasons.push({ t: `예산 초과 (최저 ${eok(Math.min(...priced.map(priceOf)))})`, neg: true }); }
  else {
    const ratio = affordable.length / priced.length;
    score += 18 + Math.round(17 * ratio);
    reasons.push({ t: `${rental ? '보증금' : '예산'} 내 ${affordable.length}/${priced.length}개 타입` });
  }

  // 면적 (15)
  if (inArea.length) { score += 10 + Math.round(5 * (inArea.length / Math.max(models.length, 1))); reasons.push({ t: `선호 면적 ${inArea.length}개 타입` }); }
  else if (models.length) reasons.push({ t: '선호 면적대 없음', neg: true });

  // 지역 (15)
  if (!profile.gu.length) score += 9;
  else if (l.gu && profile.gu.includes(l.gu)) { score += 15; reasons.push({ t: `관심 자치구 · ${l.gu}` }); }

  // 자격 / 당첨 가능성 (25)
  if (eligibleSpecial.length) {
    score += 25;
    reasons.push({ t: `특별공급 해당 · ${eligibleSpecial.map((t) => t.label).join('·')}` });
  } else if (rental) {
    // 임대는 가점이 아니라 소득·자산 기준이라 앱이 당락을 판단할 수 없다
    score += 18;
    reasons.push({ t: '소득·자산 요건 — 공고문 확인 필요' });
  } else if (l.kind === 'LH_SALE') {
    score += 16;
    reasons.push({ t: 'LH 공공분양 — 소득·자산 요건 있음' });
  } else if (l.kind === 'REMNDR') {
    score += 20;
    reasons.push({ t: '무순위 — 가점 무관 추첨' });
  } else if (l.kind === 'URBTY') {
    score += 18;
    reasons.push({ t: '청약통장 가점 무관 (추첨)' });
  } else {
    const cut = cutlineFor(l);
    if (cut != null) {
      const margin = myScore - cut;
      score += Math.max(0, Math.min(25, 12 + margin * 1.5));
      reasons.push({ t: `내 가점 ${myScore} vs 유사 커트라인 ${cut}`, neg: margin < 0 });
    } else {
      score += 10;
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

  return {
    status: st,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    affordable: affordable.length,
    pricedCount: priced.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    minArea: areas.length ? Math.min(...areas) : null,
    maxArea: areas.length ? Math.max(...areas) : null,
    pyeong: pp.length ? Math.round(pp.reduce((a, b) => a + b, 0) / pp.length) : null,
    rental,
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
      if (r.RESIDE_SECD && r.RESIDE_SECD !== '01') continue;
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

function chipRow(container, options, selected, onToggle) {
  container.innerHTML = '';
  for (const o of options) {
    const c = el('button', 'chip' + (selected.includes(o.key) ? ' on' : ''), esc(o.label));
    c.onclick = () => onToggle(o.key);
    container.appendChild(c);
  }
}

function renderFilters() {
  chipRow($('#fStatus'), STATUSES, filters.status, (k) => { toggle(filters.status, k); renderAll(); });
  const gus = SEOUL_GU.filter((g) => listings.some((l) => l.gu === g)).map((g) => ({ key: g, label: g }));
  chipRow($('#fGu'), gus, filters.gu, (k) => { toggle(filters.gu, k); renderAll(); });
  $('#fSort').value = filters.sort;
  $('#fBudget').checked = filters.budgetOnly;
  $('#fEligible').checked = filters.eligibleOnly;
}
const toggle = (arr, k) => { const i = arr.indexOf(k); i < 0 ? arr.push(k) : arr.splice(i, 1); };

function renderCorners() {
  const nav = $('#corners'); nav.innerHTML = '';
  // 상태 필터만 적용한 모수로 코너별 건수를 센다 (탭을 눌러도 숫자가 흔들리지 않게)
  const pool = listings.filter((l) => filters.status.includes(statusOf(l).key));
  const count = (key) => key === 'all' ? pool.length : pool.filter((l) => cornerOf(l) === key).length;

  const tabs = [{ key: 'all', label: '전체', icon: '📋', desc: '서울에서 지금 열려 있는 모든 공고입니다.' }, ...CORNERS];
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
      if (filters.status.length && !filters.status.includes(a.status.key)) return false;
      if (filters.corner !== 'all' && cornerOf(l) !== filters.corner) return false;
      if (filters.gu.length && !(l.gu && filters.gu.includes(l.gu))) return false;
      if (filters.budgetOnly && a.pricedCount > 0 && a.affordable === 0) return false;
      if (filters.eligibleOnly && !a.eligibleSpecial.length) return false;
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
      <div class="match ${tier}"><b>${a.score}</b><span>맞춤도</span></div>
    </div>
    <div class="badges">
      <span class="badge ${st.key === 'live' ? 'live' : (st.key === 'soon' || st.key === 'notice') ? 'soon' : 'done'}">${esc(st.label)}${dText ? ` · ${dText}` : ''}</span>
      <span class="badge tag">${esc(l.kindLabel)}</span>
      ${l.flags?.priceCap ? '<span class="badge">분양가상한제</span>' : ''}
      ${l.flags?.speculative ? '<span class="badge hot">투기과열</span>' : ''}
      ${a.cmpetAvg != null ? `<span class="badge ${a.cmpetAvg >= 20 ? 'hot' : ''}">경쟁률 ${a.cmpetAvg}:1</span>` : ''}
    </div>
    <div class="kv">
      <div><span>${a.rental ? '보증금' : '분양가'}</span><b>${a.minPrice != null ? `${eok(a.minPrice)}${a.maxPrice !== a.minPrice ? ` ~ ${eok(a.maxPrice)}` : ''}` : '공고문 참조'}</b></div>
      <div><span>${a.rental ? '월임대료' : '평당가'}</span><b>${a.rental
        ? (a.minMonthly != null ? `${num(a.minMonthly)}만원${a.maxMonthly !== a.minMonthly ? ` ~ ${num(a.maxMonthly)}` : ''}` : '—')
        : (a.pyeong ? `${num(a.pyeong)}만원` : '—')}</b></div>
      <div><span>전용면적</span><b>${a.minArea != null ? `${a.minArea} ~ ${a.maxArea}㎡` : '—'}</b></div>
      <div><span>${st.key === 'done' ? '당첨발표' : '주요 일정'}</span><b>${fmtDate(st.until)}</b></div>
    </div>
    <div class="reasons">${a.reasons.slice(0, 3).map((r) => `<span class="reason${r.neg ? ' neg' : ''}">${esc(r.t)}</span>`).join('')}</div>`;
  c.onclick = () => openDrawer(l.id);
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

  const files = l.attachments || [];
  const filesSection = files.length ? `<section><h3>공고문 첨부</h3><div class="files">${files.map((f) => {
    const pdf = /\.pdf(\?|$)/i.test(f.url) || /pdf/i.test(f.name);
    const hwp = /\.hwpx?(\?|$)/i.test(f.url) || /hwp/i.test(f.name);
    return `<a class="file" href="${esc(f.url)}" target="_blank" rel="noopener">
      <span class="ico">${pdf ? '📕' : hwp ? '📘' : '📄'}</span>
      <span class="nm">${esc(f.name)}</span><span class="go">열기 ↗</span></a>`;
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
  <h2>${esc(l.name)}</h2>
  <p class="lead small">${esc(l.address || '')}</p>
  <div class="badges" style="margin-top:10px">
    <span class="badge ${a.status.key === 'live' ? 'live' : (a.status.key === 'soon' || a.status.key === 'notice') ? 'soon' : 'done'}">${esc(a.status.label)}</span>
    <span class="badge tag">${esc(l.kindLabel)}${l.subType ? ' · ' + esc(l.subType) : ''}</span>
    ${l.totalUnits ? `<span class="badge">총 ${num(l.totalUnits)}세대</span>` : ''}
    ${l.flags?.priceCap ? '<span class="badge">분양가상한제</span>' : ''}
    ${l.flags?.speculative ? '<span class="badge hot">투기과열지구</span>' : ''}
    ${l.flags?.regulated ? '<span class="badge hot">조정대상지역</span>' : ''}
  </div>

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
  $('#pBirth').value = profile.birthYm || '';
  $('#pMarriage').value = profile.marriageDate || '';
  $('#pNoHouseSince').value = profile.noHouseSince || '';
  $('#pAccountYm').value = profile.accountYm || '';
  $('#pFamily').value = profile.family;
  $('#pBudget').value = profile.budgetEok;
  $('#pAreaMin').value = profile.areaMin;
  $('#pAreaMax').value = profile.areaMax;
  $('#pSeoulResident').checked = profile.seoulResident;
  renderProfileChips();
  updateScoreOut();
  $('#profileModal').hidden = false;
}

// 칩만 다시 그린다 — 입력 중인 숫자 필드 값을 건드리지 않기 위해
function renderProfileChips() {
  chipRow($('#pSpecial'), SPECIAL_TYPES, profile.special, (k) => { toggle(profile.special, k); renderProfileChips(); });
  chipRow($('#pGu'), SEOUL_GU.map((g) => ({ key: g, label: g })), profile.gu, (k) => { toggle(profile.gu, k); renderProfileChips(); });
}

function formFromModal() {
  return {
    birthYm: $('#pBirth').value,
    marriageDate: $('#pMarriage').value,
    noHouseSince: $('#pNoHouseSince').value,
    accountYm: $('#pAccountYm').value,
    family: +$('#pFamily').value || 0,
  };
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
        <div class="org">${esc(s.org)}${s.required ? ' · 필수' : ''}</div>
      </div>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">${s.ok ? '문서 ↗' : '활용신청 ↗'}</a>
    </div>`).join('');
}

function renderAll() { renderMeCard(); renderCorners(); renderFilters(); renderCards(); }

function showSetup() { $('#setup').hidden = false; $('#app').hidden = true; }
function showApp() { $('#setup').hidden = true; $('#app').hidden = false; }

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
$('#btnProfile').onclick = openProfile;
$('#fSort').onchange = (e) => { filters.sort = e.target.value; renderCards(); };
$('#fBudget').onchange = (e) => { filters.budgetOnly = e.target.checked; renderCards(); };
$('#fEligible').onchange = (e) => { filters.eligibleOnly = e.target.checked; renderCards(); };
$('#fReset').onclick = () => {
  filters = { status: ['live', 'soon', 'result', 'notice'], corner: 'all', gu: [], sort: 'match', budgetOnly: false, eligibleOnly: false };
  renderAll();
};

for (const id of ['pBirth', 'pMarriage', 'pNoHouseSince', 'pAccountYm', 'pFamily']) {
  $('#' + id).addEventListener('input', updateScoreOut);
}

$('#pSave').onclick = () => {
  profile = {
    ...profile,
    ...formFromModal(),
    budgetEok: +$('#pBudget').value || 0,
    areaMin: +$('#pAreaMin').value || 0,
    areaMax: +$('#pAreaMax').value || 999,
    seoulResident: $('#pSeoulResident').checked,
  };
  saveProfile();
  $('#profileModal').hidden = true;
  renderAll();
};

document.addEventListener('click', (e) => {
  if (e.target.matches('[data-close]')) {
    $('#drawer').hidden = true;
    $('#profileModal').hidden = true;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#drawer').hidden = true; $('#profileModal').hidden = true; }
});

// ── 시작 ─────────────────────────────────────────────────────────────
(async () => {
  if (STATIC) {
    $('#btnRefresh').hidden = true;   // 정적 배포에는 서버가 없다
    showApp(); renderMeCard(); load(false);
    return;
  }
  const h = await (await fetch('/api/health')).json();
  if (!h.hasKey) { showSetup(); return; }
  showApp(); renderMeCard(); load(false);
})();
