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
const SH_DROP = /(채용|인턴|입찰|설문|정보공개|계약직|공고문\s*정정\s*없음|인사)/;

/** 제목에서 SH 주택 유형을 읽어낸다 */
const SH_TYPES = ['장기전세주택', '청년안심주택', '행복주택', '매입임대주택', '장기안심주택', '희망하우징',
  '전세임대', '영구임대주택', '재개발임대주택', '두레주택', '사회주택', '도시형생활주택',
  '국민임대', '공공임대', '미리내집', '신혼', '공공분양'];
const shType = (t) => SH_TYPES.find((k) => t.includes(k)) || 'SH 공고';

/** 같은 게시판에 모집공고와 발표·안내가 섞여 있다. 알림은 '모집'만 보내야 한다. */
function shNoticeKind(t) {
  if (/(당첨자|서류심사|예비자|합격자|추가\s*모집\s*대상)/.test(t)) return '발표';
  if (/(입주자\s*모집|모집\s*공고|공급\s*공고|청약\s*접수)/.test(t)) return '모집';
  return '안내';
}

export async function scrapeSh({ pages = 2 } = {}) {
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
        type: shType(title), noticeKind: shNoticeKind(title) });
    }
    await new Promise((r) => setTimeout(r, 700)); // 서버 배려
  }
  const seen = new Set();
  return out.filter((r) => (seen.has(r.seq) ? false : seen.add(r.seq)));
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
