// SH·HUG 공고 수집 — 두 기관 모두 실시간 공고 Open API가 없어 공개 게시판을 읽는다.
// robots.txt에서 허용된 공개 목록 페이지만 보고, 요청 간격을 두며, 실패해도 앱 전체는 계속 돈다.

import { fetchRetry } from './net.mjs';
import { extractCriteria } from './criteria.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim();

const cellsOf = (tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));

async function get(url, { charset = 'utf-8' } = {}) {
  const res = await fetchRetry(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder(charset).decode(buf);
}

// ── SH 서울주택도시공사 ──────────────────────────────────────────────
const SH_LIST = 'https://www.i-sh.co.kr/main/lay2/program/S1T1637C1639/www/brd/m_247/list.do';
const SH_VIEW = 'https://www.i-sh.co.kr/main/lay2/program/S1T1637C1639/www/brd/m_247/view.do?seq=';

// 게시판에는 채용·입찰·설문도 섞여 있어 주택 공고만 골라낸다
const SH_KEEP = /(모집\s*공고|입주자\s*모집|청약|공급\s*공고|당첨자|서류심사|예비\s*입주자)/;
const SH_DROP = /(채용|인턴|입찰|설문|정보공개|계약직|인사|일자리|참여자|상담가|인큐베이팅|강사|위탁|용역|공모전|매각|사원|직원)/;

/** 제목에서 SH 주택 유형을 읽어낸다 */
const SH_TYPES = ['장기전세주택', '청년안심주택', '행복주택', '매입임대주택', '장기안심주택', '희망하우징',
  '전세임대', '영구임대주택', '재개발임대주택', '두레주택', '사회주택', '도시형생활주택',
  '국민임대', '공공임대', '미리내집', '신혼', '공공분양'];
const shType = (t) => SH_TYPES.find((k) => t.includes(k)) || 'SH 공고';

const pad = (v) => String(v).padStart(2, '0');

/** '2026년 9월 7일' · '2026.09.07' · '9월 7일'(연도 보충) → ISO */
function parseKoreanDate(raw, fallbackYear) {
  let m = raw.match(/(20\d{2})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

// SH 공고 본문은 '■ 접수일 ○ 인터넷 접수 : 2026. 9. 9.( 수 ) 10:00 ~ 9. 11.( 금 ) 17:00'
// 처럼 항목 기호·요일·시각이 섞이고, 뒤쪽 날짜는 연도를 생략한다.
// 일정 구간을 통째로 잘라 그 안의 날짜를 모두 모으고, 최소~최대를 접수기간으로 본다.
const SCHEDULE_KEY = /(청약\s?신청\s?일정|청약\s?일정|접수\s?일정|신청\s?일정|접수\s?기간|신청\s?기간|모집\s?기간|접수\s?일시|신청\s?일시|모집\s?신청일|접수일)/g;
const RESULT_KEY = /당첨자\s?발표/;
// 연도는 생략될 수 있다. 시각(10:00)과 섞이지 않도록 끝에 '.' 또는 '일'을 요구한다.
const ANY_DATE = /(?:(20\d{2})\s*[.\-년]\s*)?(\d{1,2})\s*[.\-월]\s*(\d{1,2})\s*[.일]/g;
const SECTION_END = /[■□▣]/;

/** 구간 안의 날짜를 ISO로 모은다. 연도가 없으면 앞서 나온 연도를 잇는다. */
function datesIn(text, defaultYear) {
  const out = [];
  let year = defaultYear;
  for (const m of text.matchAll(ANY_DATE)) {
    if (m[1]) year = m[1];
    const mo = Number(m[2]);
    const day = Number(m[3]);
    if (!year || mo < 1 || mo > 12 || day < 1 || day > 31) continue;
    out.push(`${year}-${pad(mo)}-${pad(day)}`);
  }
  return out;
}

/** 키워드 다음부터 다음 항목 기호(■)까지를 한 구간으로 본다 */
function sectionAfter(text, index, max = 420) {
  const raw = text.slice(index, index + max);
  const stop = raw.slice(20).search(SECTION_END);   // 키워드 바로 뒤의 기호는 건너뛴다
  return stop >= 0 ? raw.slice(0, stop + 20) : raw;
}

/**
 * SH 상세 본문에서 청약 접수기간과 당첨자 발표일을 찾는다.
 * 날짜가 둘 이상 있는 구간(시작~종료가 분명한 곳)을 우선한다.
 * 첨부 공고문(PDF)에만 일정이 있는 공고도 있어, 못 찾으면 null을 준다 — 지어내지 않는다.
 */
export function extractPeriod(text) {
  const yearHint = (text.match(/모집\s?공고일\s*:?\s*(20\d{2})/) || text.match(/(20\d{2})/) || [])[1];

  const candidates = [];
  for (const m of text.matchAll(SCHEDULE_KEY)) {
    const dates = datesIn(sectionAfter(text, m.index), yearHint);
    if (dates.length) candidates.push(dates);
  }
  const best = candidates.find((d) => new Set(d).size >= 2) || candidates[0];

  let resultDate = null;
  const r = text.search(RESULT_KEY);
  if (r >= 0) {
    const d = datesIn(text.slice(r, r + 120), yearHint);
    if (d.length) resultDate = d[0];
  }

  if (!best) return resultDate ? { resultDate } : null;
  return {
    from: best.reduce((a, b) => (a < b ? a : b)),
    to: best.reduce((a, b) => (a > b ? a : b)),
    resultDate,
  };
}

/**
 * SH 문서뷰어에서 공고문 글자를 읽는다.
 *
 * htmlConverter.do 는 302로 doc.html?fn=…&rs=… 로 넘긴다. 뷰어는 그 fn/rs 로
 * 쪽마다 XML을 받아 그린다. 그 XML에 글자가 들어 있어, 자바스크립트 없이도 읽을 수 있다.
 * 다만 뷰어가 글자를 낱개로 배치해 사이사이 공백이 끼므로 공백을 모두 지워 붙인다.
 */
export async function shNoticeText(seq, fileSeq = 1, { maxPages = 10 } = {}) {
  const conv = `https://www.i-sh.co.kr/main/com/util/htmlConverter.do?brd_id=GS0401&seq=${seq}&data_tp=A&file_seq=${fileSeq}`;
  const res = await fetchRetry(conv, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const loc = res.headers.get('location');
  if (!loc) return '';
  const u = new URL(loc, 'https://www.i-sh.co.kr');
  const fn = u.searchParams.get('fn');
  const rs = u.searchParams.get('rs');
  if (!fn || !rs) return '';

  let out = '';
  for (let i = 1; i <= maxPages; i++) {
    let r;
    try { r = await fetchRetry(`https://www.i-sh.co.kr${rs}${fn}.files/${fn}_${i}.xml`, { headers: { 'User-Agent': UA }, retries: 1 }); }
    catch { break; }
    if (!r.ok) break;
    out += (await r.text()).replace(/<[^>]+>/g, ' ');
  }
  return out.replace(/\s+/g, '');   // 낱개로 흩어진 글자를 도로 붙인다
}

/**
 * SH 첨부. 내려받기 주소는 자바스크립트 뒤에 숨어 있지만, 미리보기용 문서뷰어 주소는 노출된다.
 * 이 뷰어는 PDF와 한글 파일을 모두 웹에서 열어 주므로 그대로 쓴다.
 */
function shAttachments(html, seq) {
  // 페이지에 확장자 아이콘 견본이 주석으로 들어 있어 그대로 긁으면 '.pdf'만 나온다
  const clean = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const names = [...clean.matchAll(/class="btnAttach[^"]*"[^>]*>\s*([^<]{3,120}?)\s*</g)]
    .map((m) => strip(m[1]))
    .filter((n) => !/^\.[a-z0-9]+$/i.test(n));
  const views = [...html.matchAll(/href="([^"]*htmlConverter\.do[^"]*)"/g)]
    .map((m) => 'https://www.i-sh.co.kr' + m[1].replace(/&amp;/g, '&'));
  return views.map((url, i) => ({ name: names[i] || `첨부 ${i + 1}`, url, viewer: true }));
}

/** 모집공고의 상세 페이지를 열어 접수기간을 채운다 (건수가 적어 부담이 크지 않다) */
async function fillPeriods(rows, limit) {
  const targets = rows.filter((r) => r.noticeKindHint === '모집').slice(0, limit);
  for (const r of targets) {
    try {
      const html = await get(r.url);
      const text = strip(html);
      const period = extractPeriod(text);
      if (period?.from) { r.receiptStart = period.from; r.receiptEnd = period.to; }
      if (period?.resultDate) r.resultDate = period.resultDate;
      // 같은 페이지에서 소득·자산 기준도 함께 읽는다 (추가 요청이 들지 않는다)
      const c = extractCriteria(text);
      if (c) r.criteria = { ...c, from: '공고 본문' };
      r.attachments = shAttachments(html, r.seq);

      // 본문에 기준이 없으면 첨부 공고문을 문서뷰어로 읽는다
      if (!r.criteria && r.attachments.length) {
        try {
          const doc = await shNoticeText(r.seq, 1);
          if (doc) {
            const dc = extractCriteria(doc);
            if (dc) r.criteria = { ...dc, from: `공고문 ${r.attachments[0].name}` };
            // 접수기간도 본문에서 못 찾았으면 여기서 한 번 더 본다
            if (!r.receiptStart) {
              const dp = extractPeriod(doc);
              if (dp?.from) { r.receiptStart = dp.from; r.receiptEnd = dp.to; }
              if (dp?.resultDate && !r.resultDate) r.resultDate = dp.resultDate;
            }
          }
        } catch { /* 뷰어가 없는 첨부도 있다 */ }
      }
    } catch { /* 한 건 실패해도 나머지는 계속 */ }
    await new Promise((res) => setTimeout(res, 600));
  }
  return rows;
}

export async function scrapeSh({ pages = 2, withPeriods = true, periodLimit = 20 } = {}) {
  const out = [];
  for (let page = 1; page <= pages; page++) {
    const html = await get(`${SH_LIST}?page=${page}`);   // 이 게시판의 페이징 파라미터는 page
    const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    for (const tr of trs) {
      const seq = tr.match(/getDetailView\('(\d+)'\)/)?.[1];
      if (!seq) continue;
      const c = cellsOf(tr);
      if (c.length < 4) continue;
      const title = c[1].replace(/^NEW\s*/, '');
      if (!SH_KEEP.test(title) || SH_DROP.test(title)) continue;
      out.push({ seq, no: c[0], title, dept: c[2], date: c[3], url: SH_VIEW + seq,
        type: shType(title),   // 모집/발표 분류는 normalize.mjs가 맡는다
        noticeKindHint: /(당첨자|서류\s*심사|합격자|입주\s*대상자|동호\s*배정|사전\s*방문)/.test(title) ? '발표' : '모집' });
    }
    await new Promise((r) => setTimeout(r, 700)); // 서버 배려
  }
  const seen = new Set();
  const rows = out.filter((r) => (seen.has(r.seq) ? false : seen.add(r.seq)));
  return withPeriods ? fillPeriods(rows, periodLimit) : rows;
}

// ── HUG 든든전세주택 ────────────────────────────────────────────────
const HUG_LIST = 'https://www.khug.or.kr/jeonse/web/s07/s070102.jsp';

/** 표 헤더: 번호 공고일자 청약접수기간 시도 시군구 주소 주택유형 매입유형 전용면적 임대보증금액 신청자수 */
export async function scrapeHug() {
  const html = await get(HUG_LIST, { charset: 'euc-kr' });
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const out = [];
  for (const tr of trs) {
    const c = cellsOf(tr);
    if (c.length < 8 || c[0] === '번호' || !/^\d+$/.test(c[0])) continue;
    out.push({
      no: c[0], noticeDate: c[1], period: c[2], sido: c[3], sigungu: c[4],
      address: c[5], houseType: c[6], buyType: c[7],
      area: c[8] ?? '', deposit: c[9] ?? '', applicants: c[10] ?? '',
      url: HUG_LIST,
    });
  }
  return out;
}

// ── 도시근로자 가구원수별 월평균소득 기준표 ─────────────────────────
// SH가 공표 표를 웹으로 올려 둔다. 매년 3월 통계청 발표 후 갱신되므로
// 숫자를 코드에 박지 않고 여기서 읽어 온다.
const SH_INCOME_URL = 'https://www.i-sh.co.kr/app/lay2/S48T1587C589/contents.do/';

/**
 * 표에는 70·80·90·105… 처럼 일부 비율만 실린다.
 * 어떤 비율이든 계산할 수 있게 100% 기준액을 역산해 둔다.
 * 반환: { year, base: { 1: 원, 2: 원, … }, source }
 */
export async function scrapeIncomeStandard() {
  const html = await get(SH_INCOME_URL);
  const year = (html.match(/(20\d{2})\s*년\s*도시근로자/) || [])[1] || null;

  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => cellsOf(m[1]));
  const header = rows.find((c) => c.some((x) => /1인\s*가구/.test(x)));
  if (!header) throw new Error('소득 기준표를 찾지 못했습니다');
  // 헤더에서 '3인가구' → 3 처럼 가구원수를 뽑는다
  const sizes = header.map((h) => Number((h.match(/(\d+)\s*인/) || [])[1]) || null);

  const base = {};
  for (const cells of rows) {
    const pct = Number((String(cells[0]).match(/^(\d+)\s*%/) || [])[1]);
    if (!pct) continue;
    cells.forEach((v, i) => {
      const size = sizes[i];
      const won = Number(String(v).replace(/[^0-9]/g, ''));
      if (!size || !won) return;
      const hundred = Math.round((won / pct) * 100);
      // 여러 행에서 역산한 값이 조금씩 어긋날 수 있어 평균을 낸다
      (base[size] ||= []).push(hundred);
    });
  }
  const avg = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const table = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, avg(v)]));
  if (!Object.keys(table).length) throw new Error('소득 기준표를 해석하지 못했습니다');

  return { year, base: table, source: SH_INCOME_URL, fetchedAt: Date.now() };
}

// ── 기준 중위소득표 (통합공공임대용) ────────────────────────────────
// 통합공공임대만 도시근로자 소득이 아니라 기준 중위소득을 쓴다.
// LH 통합공공임대 입주자격 페이지에 해마다 갱신된 표가 실린다.
const LH_UNIFIED_URL = 'https://apply.lh.or.kr/lhapply/cm/cntnts/cntntsView.do?mi=1201585&cntntsId=1201333';

/** 반환: { year, base: { 1: 원, … }, source } — base는 중위소득 100% */
export async function scrapeMedianIncome() {
  const html = await get(LH_UNIFIED_URL);
  const year = (html.match(/(20\d{2})\s*년\s*가구원수별\s*기준\s*중위소득/) || [])[1] || null;

  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const tbl = m[0];
    if (!/중위소득/.test(strip(tbl))) continue;
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => cellsOf(r[1]));

    // 헤더에서 퍼센트 열 순서를 읽는다 (30·50·70·100·110·120·130·150…)
    const pcts = (rows.find((c) => c.filter((x) => /^\d+%$/.test(x)).length >= 4) || [])
      .filter((x) => /^\d+%$/.test(x)).map((x) => Number(x.replace('%', '')));
    const at100 = pcts.indexOf(100);
    if (at100 < 0) continue;

    const base = {};
    for (const cells of rows) {
      const size = Number((String(cells[0]).match(/^(\d+)\s*인/) || [])[1]);
      if (!size) continue;
      const nums = cells.slice(1).map((v) => Number(String(v).replace(/[^0-9]/g, ''))).filter(Boolean);
      if (nums[at100]) base[size] = nums[at100];
    }
    if (Object.keys(base).length >= 4) return { year, base, source: LH_UNIFIED_URL, fetchedAt: Date.now() };
  }
  throw new Error('기준 중위소득표를 찾지 못했습니다');
}
