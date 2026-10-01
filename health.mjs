// 상류가 흔들려도 사이트가 거짓말하지 않게 하는 곳.
//
// 이 시스템이 실제로 겪은 고장은 세 종류였다.
//   1) 청약홈이 오류가 아니라 totalCount 0 을 돌려준다 — 조용히 목록이 빈다.
//   2) 한 출처만 죽는데 다른 출처가 늘어 합계로는 티가 안 난다.
//   3) 게시판 구조가 바뀌어 파싱이 깨진다 — 건수는 그대로인데 접수기간이 사라진다.
// 건수 하나만 보는 방어로는 셋 다 못 잡아서, 판단 근거를 여기 모았다.

/** 공고 종류가 어느 출처에서 오는지 — 출처 단위로 살았는지 죽었는지 보기 위한 표 */
export const KIND_SOURCE = {
  APT: 'applyhome-detail',
  REMNDR: 'applyhome-detail',
  URBTY: 'applyhome-detail',
  RENT: 'applyhome-detail',
  LH_RENT: 'lh-notice',
  LH_SALE: 'lh-notice',
  LH_WELFARE: 'myhome',
  MYHOME_RENT: 'myhome',
  SH: 'sh-board',
  HUG: 'hug-board',
  YOUTHSAFE: 'soco',
};

const DAY = 86400000;

/** 출처가 통째로 비었다고 볼 최소 건수 — 원래 한두 건이던 출처는 0이어도 이상하지 않다 */
const VANISH_MIN = 5;
/** 이만큼 지난 자료는 더 이어 붙이지 않는다. 접수가 끝났을 가능성이 높다. */
const CARRY_MAX_DAYS = 7;
/** 합계가 이 아래로 떨어지면 통째로 손대지 않는다 */
const TOTAL_FLOOR = 0.6;

const countBy = (rows, f) => rows.reduce((m, r) => (m[f(r)] = (m[f(r)] || 0) + 1, m), {});
const pct = (n, d) => (d ? n / d : 0);

/**
 * 직전 스냅샷과 이번 수집을 견주어 무엇을 할지 정한다.
 *   publish — 그대로 낸다
 *   carry   — 죽은 출처만 직전 값으로 메우고 낸다
 *   hold    — 손대지 않는다 (전면 장애)
 */
export function assess(prev, next) {
  const issues = [];
  const add = (level, text) => issues.push({ level, text });

  const before = prev?.listings ?? [];
  const after = next.listings ?? [];

  // ── 1. 출처별 생사 ────────────────────────────────────────────────
  const pb = countBy(before, (l) => l.kind);
  const nb = countBy(after, (l) => l.kind);
  // 0이 된 것뿐 아니라 '거의 다 사라진' 것도 고장으로 본다. 청약홈이 42건을
  // 3건으로 돌려준 적이 있는데, 0이 아니라는 이유로 그냥 통과했다.
  const dead = Object.keys(pb).filter((k) => pb[k] >= VANISH_MIN && !nb[k]);
  const crippled = Object.keys(pb).filter((k) => pb[k] >= 20 && nb[k] && nb[k] < pb[k] * 0.3);
  const broken = [...dead, ...crippled];

  // ── 2. 메워 봐도 모자라면 손대지 않는다 ───────────────────────────
  const prevAge = prev?.builtAt ? (Date.now() - prev.builtAt) / DAY : Infinity;
  const canCarry = before.length > 0 && prevAge <= CARRY_MAX_DAYS;
  const carriedCount = canCarry ? before.filter((l) => broken.includes(l.kind)).length : 0;
  const projected = after.length + carriedCount;
  const detail = broken.map((k) => `${k}(${pb[k]}건→${nb[k] || 0})`).join(', ');

  if (before.length) {
    if (projected < before.length * TOTAL_FLOOR) {
      add('error', `직전 자료로 메워도 ${before.length}건 → ${projected}건입니다. 전면 장애로 보고 갱신하지 않습니다`);
      return { decision: 'hold', carryKinds: [], issues, counts: { before: before.length, after: after.length } };
    }
    // 낼 것의 대부분이 옛 자료라면, 새로 냈다고 말할 수 없다
    if (carriedCount > projected * 0.6) {
      add('error', `내보낼 ${projected}건 중 ${carriedCount}건이 직전 자료입니다. 갱신하지 않습니다`);
      return { decision: 'hold', carryKinds: [], issues, counts: { before: before.length, after: after.length } };
    }
  }

  // ── 3. 부분 장애는 그 출처만 메운다 ───────────────────────────────
  let carryKinds = [];
  if (broken.length) {
    if (!canCarry) {
      add('error', `출처가 고장났는데 직전 자료도 ${Math.floor(prevAge)}일 지나 이어 붙이지 않습니다: ${detail}`);
    } else {
      carryKinds = broken;
      add('warn', `상류 장애로 보입니다 — ${detail}. 해당 공고는 직전 자료를 그대로 씁니다`);
    }
  }

  // ── 4. 파싱 회귀 — 건수는 같은데 알맹이가 빠지는 경우 ─────────────
  const rate = (rows, f) => pct(rows.filter(f).length, rows.length);
  const openBefore = before.filter((l) => l.noticeKind === '모집');
  const openAfter = after.filter((l) => l.noticeKind === '모집');
  if (openBefore.length >= 20 && openAfter.length >= 20) {
    const b = rate(openBefore, (l) => l.receiptStart || l.receiptEnd);
    const a = rate(openAfter, (l) => l.receiptStart || l.receiptEnd);
    if (b - a > 0.2) {
      add('warn', `모집공고 접수기간 인식률이 ${(b * 100).toFixed(0)}% → ${(a * 100).toFixed(0)}% 로 떨어졌습니다 (공고문 서식이 바뀌었을 수 있습니다)`);
    }
  }
  if (before.length >= 50 && after.length >= 50) {
    const b = rate(before, (l) => l.gu);
    const a = rate(after, (l) => l.gu);
    if (b - a > 0.2) add('warn', `자치구 인식률이 ${(b * 100).toFixed(0)}% → ${(a * 100).toFixed(0)}% 로 떨어졌습니다`);
  }

  // ── 5. 접수기간을 못 읽은 모집공고 ────────────────────────────────
  // 서식이 제각각이라 새 공고에서 또 깨진다. 사람이 하나씩 발견해 알려 주는
  // 대신, 빌드가 스스로 세어 알린다. 출처별로 묶어야 어디가 깨졌는지 보인다.
  const missing = after.filter((l) => l.noticeKind === '모집' && !l.receiptStart && !l.receiptEnd && !l.alwaysOpen);
  if (missing.length) {
    const bySrc = countBy(missing, (l) => KIND_SOURCE[l.kind] || l.kind);
    const openCount = after.filter((l) => l.noticeKind === '모집').length;
    const share = pct(missing.length, openCount);
    add(share > 0.3 ? 'warn' : 'info',
      `접수기간을 못 읽은 모집공고 ${missing.length}건 (${Object.entries(bySrc).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  }

  return {
    missing,
    decision: carryKinds.length ? 'carry' : 'publish',
    carryKinds,
    issues,
    counts: { before: before.length, after: after.length },
  };
}

/**
 * 낼 준비가 된 목록을 마지막으로 훑는다. 여기서 걸리는 건 상류 탓이 아니라
 * 우리 코드가 잘못 만든 값이다.
 */
export function inspect(listings) {
  const issues = [];
  const seen = new Set();
  const bad = { 중복: 0, 빈이름: 0, 빈링크: 0, 잘못된주소: 0, 날짜역전: 0, 미래공고일: 0, 과도한접수기간: 0 };
  const today = new Date().toISOString().slice(0, 10);

  for (const l of listings) {
    if (seen.has(l.id)) bad.중복++; else seen.add(l.id);
    if (!String(l.name || '').trim()) bad.빈이름++;
    if (!l.noticeUrl) bad.빈링크++;
    else if (!/^https?:\/\//.test(l.noticeUrl)) bad.잘못된주소++;
    if (l.receiptStart && l.receiptEnd && l.receiptStart > l.receiptEnd) bad.날짜역전++;
    if (l.noticeDate && l.noticeDate > today) bad.미래공고일++;
    // 수시모집은 정말로 길다. 그건 API가 준 값이니 건드리지 않고, 게시판에서
    // 긁어 온 것만 본다 — 파싱이 어긋나면 여기서 드러난다.
    if (l.source === 'SH' && l.receiptStart && l.receiptEnd
        && (new Date(l.receiptEnd) - new Date(l.receiptStart)) / DAY > 60) bad.과도한접수기간++;
  }

  // 몇 건 어긋난 것과 정규화가 통째로 깨진 것은 다르다. 이름이나 링크가 절반쯤
  // 비었다면 그건 개별 공고 문제가 아니라 코드가 망가진 것이라, 내보내면 안 된다.
  const n = listings.length || 1;
  const fatal = n >= 30 && (bad.빈이름 / n > 0.2 || bad.빈링크 / n > 0.2 || bad.중복 / n > 0.2);

  for (const [k, cnt] of Object.entries(bad)) {
    if (!cnt) continue;
    const share = cnt / n;
    issues.push({
      level: fatal && share > 0.2 ? 'error' : 'warn',
      text: `${k} ${cnt}건${share > 0.05 ? ` (${(share * 100).toFixed(0)}%)` : ''}`,
    });
  }
  return { issues, fatal };
}

/** 출처 상태를 실제 수집 결과로 다시 매긴다 (예전에는 청약홈을 아예 검사하지 않았다) */
export function markSources(sources, listings, carryKinds = []) {
  const byKind = countBy(listings, (l) => l.kind);
  const bySource = {};
  for (const [kind, n] of Object.entries(byKind)) {
    const s = KIND_SOURCE[kind];
    if (s) bySource[s] = (bySource[s] || 0) + n;
  }
  const carried = new Set(carryKinds.map((k) => KIND_SOURCE[k]).filter(Boolean));

  return sources.map((s) => {
    if (carried.has(s.id)) return { ...s, ok: false, state: 'stale', note: '상류 장애 — 직전 자료를 보여 주는 중' };
    if (!s.ok) return { ...s, state: 'failed' };
    // 보조 API는 공고를 만들어 내지 않고 상세(경쟁률·첨부·주택형)만 채운다
    if (s.role === 'support') return { ...s, state: 'ok' };
    const n = bySource[s.id];
    // HUG 가 그랬듯, 0건은 '없다'가 아니라 '우리가 0건으로 받아 왔다'일 뿐이다.
    // 단정해서 적었다가 수집기가 잘못 묻고 있는 걸 반년 가까이 못 봤다.
    if (n === undefined) return { ...s, state: 'idle', note: '0건으로 조회됨 — 원본도 비었는지 확인해 보세요' };
    return { ...s, state: 'ok', count: n };
  });
}
