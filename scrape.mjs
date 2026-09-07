// SH·HUG 공고 수집 — 두 기관 모두 실시간 공고 Open API가 없어 공개 게시판을 읽는다.
// robots.txt에서 허용된 공개 목록 페이지만 보고, 요청 간격을 두며, 실패해도 앱 전체는 계속 돈다.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim();

const cellsOf = (tr) => [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => strip(m[1]));

async function get(url, { charset = 'utf-8' } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
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

const PERIOD_KEY = /(접수\s?기간|신청\s?기간|모집\s?기간|청약\s?접수\s?기간|접수\s?일정|모집\s?신청일)/g;
const PERIOD_RANGE = /((?:20\d{2}\s*[.\-년]\s*)?\d{1,2}\s*[.\-월]\s*\d{1,2}\s*일?\s*(?:\([가-힣]\))?)\s*[~∼〜–—-]\s*((?:20\d{2}\s*[.\-년]\s*)?\d{1,2}\s*[.\-월]\s*\d{1,2}\s*일?\s*(?:\([가-힣]\))?)/;

/**
 * SH 상세 본문에서 접수기간을 찾아본다.
 * 대부분은 첨부 공고문(PDF) 안에만 있어 못 찾는 경우가 더 많다 — 그때는 null을 주고,
 * 화면에서는 일정을 지어내지 않고 '원문 확인'으로 둔다.
 */
export function extractPeriod(text, noticeDate) {
  const year = noticeDate ? noticeDate.slice(0, 4) : null;
  for (const m of text.matchAll(PERIOD_KEY)) {
    const window = text.slice(m.index, m.index + 220);
    const r = window.match(PERIOD_RANGE);
    if (!r) continue;
    const from = parseKoreanDate(r[1], year);
    const to = parseKoreanDate(r[2], year);
    if (from && to && from <= to) return { from, to };
  }
  return null;
}

/** 모집공고의 상세 페이지를 열어 접수기간을 채운다 (건수가 적어 부담이 크지 않다) */
async function fillPeriods(rows, limit) {
  const targets = rows.filter((r) => r.noticeKindHint === '모집').slice(0, limit);
  for (const r of targets) {
    try {
      const html = await get(r.url);
      const period = extractPeriod(strip(html), r.date);
      if (period) { r.receiptStart = period.from; r.receiptEnd = period.to; }
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
